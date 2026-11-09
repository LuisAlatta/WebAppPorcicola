import { ApiError, commitOperation, createOperationClaim, currentFarmDate, isValidDateString, lookupExistingOperation, normalizeReason } from './events';
import { getConfigSnapshot, type ConfigSnapshot, type StageItem } from './config';
import { getInventorySnapshot } from './inventory';

type Row = Record<string, unknown>;
function configuredFeed(config:ConfigSnapshot,stage:StageItem|undefined){
  if(!stage?.rationName)return undefined;
  return config.catalogs.find(item=>item.key==='alimento')?.items.find(item=>item.name.toLocaleLowerCase('es-PE')===stage.rationName?.toLocaleLowerCase('es-PE'));
}
export interface FeedScope { allowedBarnNames?: string[] | null }
export type FeedMovementInput = {
  movementType?: unknown; effectiveDate?: unknown; warehouseId?: unknown; feedCode?: unknown; lotCode?: unknown;
  supplier?: unknown; quantityKg?: unknown; costPerKg?: unknown; destinationBarnId?: unknown; animalCode?: unknown; currencyCode?:unknown; documentReference?:unknown;
  reversesMovementId?: unknown;
  reason?: unknown; operationKey?: string;
  turn?: { shiftCode?: unknown; stageCode?: unknown; plannedKg?: unknown; servedKg?: unknown; consumedKg?: unknown };
};
const text = (value: unknown, field: string, max = 120, required = false): string | null => {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new ApiError(400, `${field} es obligatorio`);
    return null;
  }
  const result=String(value).trim();
  if(result.length>max) throw new ApiError(400,`${field} supera ${max} caracteres`);
  return result;
};
async function allowedBarnIds(db:D1Database,scope:FeedScope):Promise<number[]|null>{
  if(scope.allowedBarnNames===undefined||scope.allowedBarnNames===null) return null;
  if(!scope.allowedBarnNames.length) return [];
  const names=scope.allowedBarnNames.map(()=>'?').join(',');
  const rows=await db.prepare(`SELECT id FROM barns WHERE name IN (${names})`).bind(...scope.allowedBarnNames).all<{id:number}>();
  return (rows.results??[]).map(row=>Number(row.id));
}
async function allowedWarehouses(db:D1Database,scope:FeedScope){
  const barnIds=await allowedBarnIds(db,scope);
  if(barnIds===null) return {sql:'',params:[] as unknown[]};
  const clause=barnIds.length?` OR barn_id IN (${barnIds.map(()=>'?').join(',')})`:'';
  return {sql:` AND (barn_id IS NULL${clause})`,params:barnIds};
}
function validateDate(value:unknown){
  if(!isValidDateString(value)) throw new ApiError(400,'Fecha inválida: use AAAA-MM-DD');
  const result=String(value);
  if(result>currentFarmDate()) throw new ApiError(400,'La fecha del movimiento no puede ser futura');
  return result;
}
function kg(value:unknown){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0||Math.round(n*1000)!==n*1000) throw new ApiError(400,'Los kg deben ser positivos con hasta 3 decimales');
  return n;
}
export async function listFeedWarehouses(db:D1Database,scope:FeedScope={}){
  const allowed=await allowedWarehouses(db,scope);
  const rows=await db.prepare(`SELECT w.id,w.code,w.name,w.location,w.barn_id,w.is_active,b.name AS barn_name
    FROM feed_warehouses w LEFT JOIN barns b ON b.id=w.barn_id WHERE w.is_active=1${allowed.sql} ORDER BY w.code`)
    .bind(...allowed.params).all<Row>();
  return (rows.results??[]).map(row=>({id:Number(row.id),code:String(row.code),name:String(row.name),location:row.location===null?null:String(row.location),
    barnId:row.barn_id===null?null:Number(row.barn_id),barnName:row.barn_name===null?null:String(row.barn_name)}));
}
export async function createFeedWarehouse(db:D1Database,actorUserId:number,input:{code?:unknown;name?:unknown;location?:unknown;barnId?:unknown;operationKey?:string},scope:FeedScope={}){
  const code=text(input.code,'Código',40,true)!.toUpperCase();
  if(/\s/.test(code)) throw new ApiError(400,'El código no debe contener espacios');
  const name=text(input.name,'Nombre',100,true)!;
  const location=text(input.location,'Ubicación',120);
  const barnId=input.barnId===undefined||input.barnId===null||input.barnId===''?null:Number(input.barnId);
  if(barnId!==null&&!Number.isInteger(barnId)) throw new ApiError(400,'Galpón inválido');
  if(barnId!==null){
    const barn=await db.prepare('SELECT id,name FROM barns WHERE id=?').bind(barnId).first<{id:number;name:string}>();
    if(!barn) throw new ApiError(404,'Galpón no encontrado');
    if(scope.allowedBarnNames&&!scope.allowedBarnNames.includes(barn.name)) throw new ApiError(403,'Sin acceso al galpón');
  }
  const payload={code,name,location,barnId};
  const replay=await lookupExistingOperation(db,actorUserId,input.operationKey,payload);
  if(replay) return {replayed:true,warehouse:replay.result};
  const exists=await db.prepare('SELECT id FROM feed_warehouses WHERE code=?').bind(code).first();
  if(exists) throw new ApiError(409,'Ya existe un almacén con ese código');
  const idRow=await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM feed_warehouses').first<{id:number}>();
  const id=Number(idRow?.id??1);const now=new Date().toISOString();
  const claim=await createOperationClaim({operationKey:input.operationKey,operationType:'feed.warehouse.create',authorUserId:actorUserId,entityType:'feed_warehouse',entityId:id,barnId,effectiveDate:currentFarmDate(),payload,result:{id,code,name,location,barnId}});
  await commitOperation(db,claim,[db.prepare(`INSERT INTO feed_warehouses(id,code,name,location,barn_id,created_by_user_id,created_at) VALUES(?,?,?,?,?,?,?)`)
    .bind(id,code,name,location,barnId,actorUserId,now)],[{entityType:'feed_warehouse',entityId:id,action:'create',actorUserId,barnId,reason:'Alta de almacén',previousData:null,newData:payload,effectiveDate:currentFarmDate(),recordedAt:claim.recordedAt}]);
  return {replayed:false,warehouse:{id,code,name,location,barnId}};
}
export async function getFeedInventory(db:D1Database,asOfValue:unknown,scope:FeedScope={}){
  const asOf=asOfValue?validateDate(asOfValue):currentFarmDate();
  const allowed=await allowedWarehouses(db,scope);
  const rows=await db.prepare(`SELECT w.id AS warehouse_id,w.code AS warehouse_code,w.name AS warehouse_name,w.barn_id,
    m.feed_code,m.lot_code,SUM(m.stock_delta_kg) AS available_kg,
    SUM(CASE WHEN m.stock_delta_kg>0 THEN m.stock_delta_kg ELSE 0 END) AS received_kg,
    SUM(CASE WHEN m.stock_delta_kg<0 THEN -m.stock_delta_kg ELSE 0 END) AS withdrawn_kg,
    SUM(CASE WHEN m.movement_type='delivery' THEN m.total_cost_minor ELSE 0 END) AS allocated_cost_minor
    FROM feed_warehouses w LEFT JOIN feed_movements m ON m.warehouse_id=w.id AND m.effective_date<=?
    WHERE w.is_active=1${allowed.sql} GROUP BY w.id,w.code,w.name,w.barn_id,m.feed_code,m.lot_code
    HAVING m.feed_code IS NOT NULL ORDER BY w.code,m.feed_code,m.lot_code`).bind(asOf,...allowed.params).all<Row>();
  const inventory=(rows.results??[]).map(row=>({warehouseId:Number(row.warehouse_id),warehouseCode:String(row.warehouse_code),warehouseName:String(row.warehouse_name),barnId:row.barn_id===null?null:Number(row.barn_id),
    feedCode:String(row.feed_code),lotCode:String(row.lot_code),availableKg:Number(row.available_kg),receivedKg:Number(row.received_kg),withdrawnKg:Number(row.withdrawn_kg),allocatedCostMinor:Number(row.allocated_cost_minor)}));
  const totals=inventory.reduce((result,row)=>{result.availableKg+=row.availableKg;result.receivedKg+=row.receivedKg;result.withdrawnKg+=row.withdrawnKg;result.allocatedCostMinor+=row.allocatedCostMinor;return result;},{availableKg:0,receivedKg:0,withdrawnKg:0,allocatedCostMinor:0});
  return {asOf,inventory,totals};
}
export async function listFeedMovements(db:D1Database,filters:{from?:unknown;to?:unknown;warehouseId?:unknown;feedCode?:unknown;limit?:unknown}={},scope:FeedScope={}){
  const allowed=await allowedWarehouses(db,scope);const where=['1=1'];const params:unknown[]=[];
  if(filters.from){where.push('m.effective_date>=?');params.push(validateDate(filters.from));}
  if(filters.to){where.push('m.effective_date<=?');params.push(validateDate(filters.to));}
  if(filters.warehouseId){where.push('m.warehouse_id=?');params.push(Number(filters.warehouseId));}
  if(filters.feedCode){where.push('m.feed_code=?');params.push(String(filters.feedCode));}
  if(allowed.sql){
    const ids=allowed.params as number[];
    if(ids.length){
      const marks=ids.map(()=>'?').join(',');
      where.push(`((w.barn_id IS NULL AND (m.destination_barn_id IS NULL OR m.destination_barn_id IN (${marks}))) OR w.barn_id IN (${marks}))`);
      params.push(...ids,...ids);
    }else where.push('(w.barn_id IS NULL AND m.destination_barn_id IS NULL)');
  }
  const limit=filters.limit?Math.min(Math.max(Number(filters.limit),1),500):100;
  const rows=await db.prepare(`SELECT m.*,w.code AS warehouse_code,w.name AS warehouse_name,b.name AS destination_barn_name,a.code AS animal_code,u.name AS actor_name
    FROM feed_movements m JOIN feed_warehouses w ON w.id=m.warehouse_id LEFT JOIN barns b ON b.id=m.destination_barn_id LEFT JOIN animals a ON a.id=m.animal_id
    JOIN users u ON u.id=m.created_by_user_id WHERE ${where.join(' AND ')} ORDER BY m.effective_date DESC,m.id DESC LIMIT ?`).bind(...params,limit).all<Row>();
  return (rows.results??[]).map(row=>({id:Number(row.id),movementType:String(row.movement_type),effectiveDate:String(row.effective_date),warehouseCode:String(row.warehouse_code),warehouseName:String(row.warehouse_name),feedCode:String(row.feed_code),lotCode:String(row.lot_code),supplier:row.supplier===null?null:String(row.supplier),quantityKg:Number(row.quantity_kg),stockDeltaKg:Number(row.stock_delta_kg),costPerKg:Number(row.unit_cost_minor)/100,totalCost:Number(row.total_cost_minor)/100,currencyCode:String(row.currency_code),documentReference:row.document_reference===null?null:String(row.document_reference),reversesMovementId:row.reverses_movement_id===null?null:Number(row.reverses_movement_id),destinationBarn:row.destination_barn_name===null?null:String(row.destination_barn_name),animalCode:row.animal_code===null?null:String(row.animal_code),reason:String(row.reason),actorName:String(row.actor_name)}));
}
export async function registerFeedMovement(db:D1Database,actorUserId:number,input:FeedMovementInput,scope:FeedScope={}){
  const movementType=String(input.movementType??'');
  if(!['opening','purchase','return_in','delivery','waste','return_supplier'].includes(movementType)) throw new ApiError(400,'Tipo de movimiento de alimento inválido');
  const effectiveDate=validateDate(input.effectiveDate);const warehouseId=Number(input.warehouseId);
  if(!Number.isInteger(warehouseId)||warehouseId<=0) throw new ApiError(400,'Seleccione el almacén');
  const warehouse=await db.prepare('SELECT * FROM feed_warehouses WHERE id=? AND is_active=1').bind(warehouseId).first<Row>();
  if(!warehouse) throw new ApiError(404,'Almacén no encontrado');
  const allowed=await allowedWarehouses(db,scope);if(allowed.sql){
    const barns=allowed.params as number[];if(warehouse.barn_id!==null&&!barns.includes(Number(warehouse.barn_id)))throw new ApiError(403,'No tiene acceso al almacén');
  }
  const feedCode=text(input.feedCode,'Alimento',60,true)!;
  const lotCode=text(input.lotCode,'Lote de alimento',80,true)!;
  const quantityKg=kg(input.quantityKg);
  const costPerKg=Number(input.costPerKg);
  if(!Number.isFinite(costPerKg)||costPerKg<0||Math.round(costPerKg*100)!==costPerKg*100)throw new ApiError(400,'El costo por kg debe tener hasta dos decimales');
  const unitCostMinor=Math.round(costPerKg*100);const totalCostMinor=Math.round(quantityKg*unitCostMinor);
  if(movementType==='purchase'&&totalCostMinor<=0)throw new ApiError(400,'La compra de alimento debe tener un costo positivo para generar el egreso asociado');
  const currencyCode=String(input.currencyCode??'PEN').trim().toUpperCase();if(currencyCode!=='PEN')throw new ApiError(400,'Las compras de alimento se valoran en PEN para mantener consistente el costo por lote');const documentReference=text(input.documentReference,'Referencia del documento',100);
  const supplier=text(input.supplier,'Proveedor',160);
  const reason=normalizeReason(input.reason,{required:true});
  const config=await getConfigSnapshot(db,effectiveDate);
  if(!config.catalogs.find(item=>item.key==='alimento')?.items.some(item=>item.code===feedCode))throw new ApiError(400,'Seleccione un tipo de alimento vigente');
  let destinationBarnId:number|null=null;let animalId:number|null=null;
  const animalCode=text(input.animalCode,'Código de animal',40);
  if(movementType==='delivery'){
    destinationBarnId=input.destinationBarnId?Number(input.destinationBarnId):null;
    if(animalCode){
      const animal=await db.prepare('SELECT id,exit_date,is_active FROM animals WHERE code=?').bind(animalCode).first<Row>();
      if(!animal||String(animal.is_active)==='0'||(animal.exit_date&&effectiveDate>String(animal.exit_date)))throw new ApiError(404,'Animal no disponible en la fecha indicada');
      const location=await db.prepare(`SELECT barn_id FROM animal_location_history WHERE animal_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?) ORDER BY valid_from DESC,id DESC LIMIT 1`).bind(animal.id,effectiveDate,effectiveDate).first<{barn_id:number}>();
      if(!location)throw new ApiError(409,'No hay ubicación histórica del animal en esa fecha');
      if(destinationBarnId!==null&&destinationBarnId!==Number(location.barn_id))throw new ApiError(400,'El galpón destino no coincide con la ubicación histórica del animal');
      destinationBarnId=Number(location.barn_id);animalId=Number(animal.id);
    }
    if(!destinationBarnId)throw new ApiError(400,'Seleccione el galpón destino o un animal');
    const barn=await db.prepare('SELECT name FROM barns WHERE id=?').bind(destinationBarnId).first<{name:string}>();
    if(!barn)throw new ApiError(404,'Galpón destino no encontrado');
    if(scope.allowedBarnNames&&!scope.allowedBarnNames.includes(barn.name))throw new ApiError(403,'No tiene acceso al galpón destino');
  }else if(animalCode||input.destinationBarnId){throw new ApiError(400,'El destino solo se indica en una entrega/consumo');}
  if(movementType==='purchase'&&!supplier)throw new ApiError(400,'Indique el proveedor de la compra');
  let reversedPurchase:Row|null=null;let reversedFinancial:Row|null=null;
  if(movementType==='return_supplier'){
    const originalId=Number(input.reversesMovementId);if(!Number.isInteger(originalId)||originalId<=0)throw new ApiError(400,'Seleccione la compra original que se devuelve');
    reversedPurchase=await db.prepare(`SELECT * FROM feed_movements WHERE id=? AND movement_type='purchase' AND warehouse_id=? AND feed_code=? AND lot_code=?`).bind(originalId,warehouseId,feedCode,lotCode).first<Row>();
    if(!reversedPurchase)throw new ApiError(400,'La compra original no coincide con el almacén, alimento y lote');
    if(effectiveDate<String(reversedPurchase.effective_date))throw new ApiError(400,'La devolución no puede ser anterior a la compra');
    if(quantityKg!==Number(reversedPurchase.quantity_kg)||unitCostMinor!==Number(reversedPurchase.unit_cost_minor))throw new ApiError(400,'La devolución debe corresponder a la cantidad y costo de la compra completa');
    const returned=await db.prepare('SELECT id FROM feed_movements WHERE reverses_movement_id=?').bind(originalId).first();if(returned)throw new ApiError(409,'La compra de alimento ya tiene una devolución registrada');
    const purchaseFinance=await db.prepare("SELECT * FROM financial_entries WHERE source_type='feed_purchase' AND source_id=? AND reversed_at IS NULL").bind(String(originalId)).first<Row>();
    if(!purchaseFinance)throw new ApiError(409,'No se encontró un egreso vigente ligado a la compra original');if(Number(purchaseFinance.amount_minor)!==totalCostMinor)throw new ApiError(400,'El importe de devolución debe coincidir con el pago original');reversedFinancial=purchaseFinance;
    const laterMovement=await db.prepare(`SELECT id FROM feed_movements WHERE warehouse_id=? AND feed_code=? AND lot_code=? AND (effective_date>? OR (effective_date=? AND (created_at>? OR (created_at=? AND id>?)))) LIMIT 1`).bind(warehouseId,feedCode,lotCode,String(reversedPurchase.effective_date),String(reversedPurchase.effective_date),String(reversedPurchase.created_at),String(reversedPurchase.created_at),originalId).first();
    if(laterMovement)throw new ApiError(409,'La compra ya tiene movimientos posteriores; corrija primero el consumo o la salida desde su origen');
    const currentStock=await db.prepare('SELECT COALESCE(SUM(stock_delta_kg),0) AS available FROM feed_movements WHERE warehouse_id=? AND feed_code=? AND lot_code=? AND effective_date<=?').bind(warehouseId,feedCode,lotCode,effectiveDate).first<{available:number}>();
    if(Number(currentStock?.available??0)!==quantityKg)throw new ApiError(409,'El saldo del lote no coincide con la compra completa que se desea devolver');
  }
  if(movementType==='waste'&&!reason)throw new ApiError(400,'Indique el motivo de la merma');
  const payload={movementType,effectiveDate,warehouseId,feedCode,lotCode,supplier,quantityKg,costPerKg,currencyCode,documentReference,destinationBarnId,animalId,reversesMovementId:input.reversesMovementId??null,reason,turn:input.turn??null};
  const replay=await lookupExistingOperation(db,actorUserId,input.operationKey,payload);
  if(replay)return {replayed:true,movement:replay.result};
  const id=Date.now()*1000+Math.floor(Math.random()*1000);
  const positive=['opening','purchase','return_in'].includes(movementType);const stockDeltaKg=positive?quantityKg:-quantityKg;
  const warehouseBarnId=warehouse.barn_id===null?null:Number(warehouse.barn_id);const warehouseBarn=warehouseBarnId===null?null:await db.prepare('SELECT name FROM barns WHERE id=?').bind(warehouseBarnId).first<{name:string}>();const financialEntryId=['purchase','return_supplier'].includes(movementType)?Number((await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM financial_entries').first<{id:number}>())?.id??1):null;
  const claim=await createOperationClaim({operationKey:input.operationKey,operationType:`feed.${movementType}`,authorUserId:actorUserId,entityType:'feed_movement',entityId:id,barnId:destinationBarnId??warehouseBarnId,effectiveDate,payload,result:{id,movementType,effectiveDate,warehouseId,feedCode,lotCode,quantityKg,stockDeltaKg,costPerKg,totalCost:totalCostMinor/100,destinationBarnId,animalId,financialEntryId}});
  const movement={id,movementType,effectiveDate,warehouseId,feedCode,lotCode,supplier,quantityKg,stockDeltaKg,costPerKg,totalCost:totalCostMinor/100,currencyCode,documentReference,destinationBarnId,animalId,reversesMovementId:reversedPurchase?Number(reversedPurchase.id):null,reason};
  let turnStatement:D1PreparedStatement|undefined;
  if(input.turn){
    if(movementType!=='delivery'||animalId!==null||destinationBarnId===null)throw new ApiError(400,'El turno debe ser una entrega a un galpón');
    const shiftCode=text(input.turn.shiftCode,'Turno',20,true)!;
    if(!['manana','tarde','noche'].includes(shiftCode))throw new ApiError(400,'Turno inválido');
    const stageCode=text(input.turn.stageCode,'Etapa',40,true)!;
    const plannedKg=Number(input.turn.plannedKg);const servedKg=Number(input.turn.servedKg);
    if(!Number.isFinite(plannedKg)||plannedKg<0||Math.round(plannedKg*1000)!==plannedKg*1000)throw new ApiError(400,'La cantidad prevista debe ser cero o positiva con hasta 3 decimales');
    if(servedKg!==quantityKg)throw new ApiError(400,'La cantidad servida debe coincidir con los kg de la entrega real');
    const consumedKg=input.turn.consumedKg===undefined||input.turn.consumedKg===null||input.turn.consumedKg===''?null:Number(input.turn.consumedKg);
    if(consumedKg!==null&&(!Number.isFinite(consumedKg)||consumedKg<0||consumedKg>servedKg||Math.round(consumedKg*1000)!==consumedKg*1000))throw new ApiError(400,'El consumo real debe estar entre cero y la cantidad servida');
    const stage=await db.prepare('SELECT code FROM stage_versions WHERE code=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) AND status=\'active\'').bind(stageCode,effectiveDate,effectiveDate).first();
    if(!stage)throw new ApiError(400,'Seleccione una etapa vigente');
    const stageConfig=config.stages.find(item=>item.code===stageCode);
    const expectedFeed=configuredFeed(config,stageConfig);
    if(!expectedFeed)throw new ApiError(400,'Vincule la ración de la etapa con un alimento del catálogo');
    if(expectedFeed.code!==feedCode)throw new ApiError(400,'El alimento no coincide con la ración configurada para la etapa');
    turnStatement=db.prepare(`INSERT INTO feed_turns(operation_log_id,feed_movement_id,effective_date,shift_code,barn_id,stage_code,feed_code,lot_code,planned_kg,served_kg,consumed_kg,created_by_user_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(claim.id,id,effectiveDate,shiftCode,destinationBarnId,stageCode,feedCode,lotCode,plannedKg,servedKg,consumedKg,actorUserId,claim.recordedAt);
  }
  const signCheck=db.prepare(`INSERT INTO feed_stock_guard (guard_id)
    SELECT CASE WHEN COALESCE(MIN(running),0)>=0 THEN 0 ELSE -1 END FROM (
      SELECT SUM(stock_delta_kg) OVER (ORDER BY effective_date,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
      FROM feed_movements WHERE warehouse_id=? AND feed_code=? AND lot_code=?)`).bind(warehouseId,feedCode,lotCode);
  const statements=[db.prepare(`INSERT INTO feed_movements(id,operation_log_id,warehouse_id,movement_type,effective_date,feed_code,lot_code,supplier,quantity_kg,stock_delta_kg,unit_cost_minor,total_cost_minor,destination_barn_id,animal_id,reason,created_by_user_id,created_at,currency_code,document_reference,reverses_movement_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,claim.id,warehouseId,movementType,effectiveDate,feedCode,lotCode,supplier,quantityKg,stockDeltaKg,unitCostMinor,totalCostMinor,destinationBarnId,animalId,reason,actorUserId,claim.recordedAt,currencyCode,documentReference,reversedPurchase?Number(reversedPurchase.id):null),...(financialEntryId===null?[]:[...(reversedFinancial?[db.prepare('UPDATE financial_entries SET reversed_at=? WHERE id=? AND reversed_at IS NULL').bind(claim.recordedAt,Number(reversedFinancial.id))]:[]),db.prepare(`INSERT INTO financial_entries(id,operation_log_id,direction,category,concept,operation_date,amount_minor,currency_code,counterparty,reference,notes,created_by_user_id,created_at,source_type,source_id,reversal_of_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(financialEntryId,claim.id,reversedFinancial?'income':'expense',reversedFinancial?'Devolución de compra de alimento':'Compra de alimento',`${quantityKg} kg de ${feedCode} · lote ${lotCode}`,effectiveDate,totalCostMinor,currencyCode,supplier,documentReference,reason,actorUserId,claim.recordedAt,reversedFinancial?'reversal':'feed_purchase',String(reversedFinancial?.id??id),reversedFinancial?Number(reversedFinancial.id):null),db.prepare(`INSERT INTO financial_allocations(entry_id,barn_id,barn_name_snapshot,amount_minor,supply_code,lot_code,quantity,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(financialEntryId,warehouseBarnId,warehouseBarn?.name??null,totalCostMinor,feedCode,lotCode,quantityKg,claim.recordedAt)]),...(turnStatement?[turnStatement]:[]),signCheck,db.prepare('DELETE FROM feed_stock_guard')];
  await commitOperation(db,claim,statements,
    [{entityType:'feed_movement',entityId:id,action:'create',actorUserId,barnId:destinationBarnId??(warehouse.barn_id===null?null:Number(warehouse.barn_id)),reason,previousData:null,newData:movement,effectiveDate,recordedAt:claim.recordedAt},...(reversedFinancial?[{entityType:'financial_entry',entityId:Number(reversedFinancial.id),action:'update' as const,actorUserId,barnId:warehouseBarnId,reason,previousData:{reversedAt:null},newData:{reversedAt:claim.recordedAt,reversalEntryId:financialEntryId},effectiveDate,recordedAt:claim.recordedAt}]:[]),...(financialEntryId===null?[]:[{entityType:'financial_entry',entityId:financialEntryId,action:'create' as const,actorUserId,barnId:warehouseBarnId,reason,previousData:null,newData:{direction:reversedFinancial?'income':'expense',category:reversedFinancial?'Devolución de compra de alimento':'Compra de alimento',sourceType:reversedFinancial?'reversal':'feed_purchase',sourceId:reversedFinancial?.id??id,reversalOfId:reversedFinancial?.id??null,amountMinor:totalCostMinor,currencyCode,counterparty:supplier,reference:documentReference},effectiveDate,recordedAt:claim.recordedAt}])]);
  return {replayed:false,movement};
}

export async function getFeedProjection(db:D1Database,asOfValue:unknown,scope:FeedScope={}){
  const asOf=asOfValue?validateDate(asOfValue):currentFarmDate();
  const [config,animals,stock]=await Promise.all([getConfigSnapshot(db,asOf),getInventorySnapshot(db,{asOf,from:asOf,movementLimit:0},scope),getFeedInventory(db,asOf,scope)]);
  const stages=config.stages;
  const byStage=new Map(animals.summary.byStage.map(row=>[row.stageCode,row.available]));
  const projection=stages.map(stage=>{
    const heads=byStage.get(stage.code)??0;const feed=configuredFeed(config,stage);
    const requirements:string[]=[];if(heads>0&&stage.dailyFeedKg===null)requirements.push('Configurar consumo diario por cabeza');if(heads>0&&stage.durationDays===null)requirements.push('Configurar duración de etapa');if(heads>0&&!feed)requirements.push('Vincular ración con un alimento del catálogo');
    const dailyKg=heads===0?0:stage.dailyFeedKg===null?null:Number((heads*stage.dailyFeedKg).toFixed(3));
    const availableKg=feed?stock.inventory.filter(row=>row.feedCode===feed.code).reduce((sum,row)=>sum+row.availableKg,0):0;
    const stageNeedKg=heads===0?0:dailyKg!==null&&stage.durationDays!==null?Number((dailyKg*stage.durationDays).toFixed(3)):null;const monthlyNeedKg=dailyKg===null?null:Number((dailyKg*30).toFixed(3));
    return {stageCode:stage.code,stageName:stage.name,heads,rationName:stage.rationName,feedCode:feed?.code??null,feedName:feed?.name??null,dailyPerHeadKg:stage.dailyFeedKg,dailyKg,stageDays:stage.durationDays,stageNeedKg,monthlyNeedKg,availableKg,coveredDays:dailyKg&&dailyKg>0?Math.floor(availableKg/dailyKg):null,dailyShortageKg:dailyKg===null||!feed?null:Number(Math.max(0,dailyKg-availableKg).toFixed(3)),stageShortageKg:stageNeedKg===null||!feed?null:Number(Math.max(0,stageNeedKg-availableKg).toFixed(3)),monthlyShortageKg:monthlyNeedKg===null||!feed?null:Number(Math.max(0,monthlyNeedKg-availableKg).toFixed(3)),requirements};
  });
  const feedSummary=[...new Set(projection.map(row=>row.feedCode).filter((code):code is string=>Boolean(code)))].map(feedCode=>{
    const rows=projection.filter(row=>row.feedCode===feedCode);const dailyKg=rows.some(row=>row.dailyKg===null)?null:Number(rows.reduce((sum,row)=>sum+(row.dailyKg??0),0).toFixed(3));const availableKg=stock.inventory.filter(row=>row.feedCode===feedCode).reduce((sum,row)=>sum+row.availableKg,0);const monthlyNeedKg=dailyKg===null?null:Number((dailyKg*30).toFixed(3));
    return {feedCode,feedName:rows[0].feedName,heads:rows.reduce((sum,row)=>sum+row.heads,0),dailyKg,monthlyNeedKg,availableKg,coveredDays:dailyKg!==null&&dailyKg>0?Math.floor(availableKg/dailyKg):null,monthlyShortageKg:monthlyNeedKg===null?null:Number(Math.max(0,monthlyNeedKg-availableKg).toFixed(3))};
  });
  const barnIds=await allowedBarnIds(db,scope);const turnScope=barnIds===null?'':barnIds.length?` AND t.barn_id IN (${barnIds.map(()=>'?').join(',')})`:' AND 0=1';
  const turns=await db.prepare(`SELECT t.id,t.effective_date,t.shift_code,t.barn_id,b.name AS barn_name,t.stage_code,t.feed_code,t.lot_code,t.planned_kg,t.served_kg,t.consumed_kg
    FROM feed_turns t JOIN barns b ON b.id=t.barn_id WHERE t.effective_date<=?${turnScope} ORDER BY t.effective_date DESC,t.id DESC LIMIT 100`).bind(asOf,...(barnIds??[])).all<Row>();
  const periodStart=new Date(`${asOf}T00:00:00Z`);periodStart.setUTCDate(periodStart.getUTCDate()-29);const from=periodStart.toISOString().slice(0,10);
  const weightScope=barnIds===null?'':barnIds.length?` AND barn_id IN (${barnIds.map(()=>'?').join(',')})`:' AND 0=1';
  const weights=await db.prepare(`WITH measured AS (
      SELECT animal_id,barn_id,stage_code,weight_kg,
        FIRST_VALUE(barn_id) OVER (PARTITION BY animal_id ORDER BY weighed_on,weighed_time,id) AS first_barn,
        FIRST_VALUE(stage_code) OVER (PARTITION BY animal_id ORDER BY weighed_on,weighed_time,id) AS first_stage,
        FIRST_VALUE(weight_kg) OVER (PARTITION BY animal_id ORDER BY weighed_on,weighed_time,id) AS first_weight,
        LAST_VALUE(barn_id) OVER (PARTITION BY animal_id ORDER BY weighed_on,weighed_time,id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_barn,
        LAST_VALUE(stage_code) OVER (PARTITION BY animal_id ORDER BY weighed_on,weighed_time,id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_stage,
        LAST_VALUE(weight_kg) OVER (PARTITION BY animal_id ORDER BY weighed_on,weighed_time,id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_weight,
        ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY weighed_on DESC,weighed_time DESC,id DESC) AS last_row,
        COUNT(*) OVER (PARTITION BY animal_id) AS measurement_count
      FROM animal_weights WHERE weighed_on BETWEEN ? AND ?${weightScope} AND barn_id IS NOT NULL AND stage_code IS NOT NULL
    ) SELECT first_barn,first_stage,first_weight,last_weight FROM measured
      WHERE last_row=1 AND measurement_count>=2 AND first_barn=last_barn AND first_stage=last_stage`).bind(from,asOf,...(barnIds??[])).all<Row>();
  const gains=new Map<string,{gain:number;animals:number}>();for(const row of weights.results??[]){const key=`${row.first_barn}:${row.first_stage}`;const value=gains.get(key)??{gain:0,animals:0};value.gain+=Number(row.last_weight)-Number(row.first_weight);value.animals+=1;gains.set(key,value);}
  const consumedRows=await db.prepare(`SELECT t.barn_id,t.stage_code,SUM(t.consumed_kg) AS consumed_kg FROM feed_turns t WHERE t.effective_date BETWEEN ? AND ? AND t.consumed_kg IS NOT NULL${turnScope} GROUP BY t.barn_id,t.stage_code`).bind(from,asOf,...(barnIds??[])).all<Row>();
  const consumed=new Map((consumedRows.results??[]).map(row=>[`${row.barn_id}:${row.stage_code}`,Number(row.consumed_kg)]));
  const comparisonKeys=new Set([...gains.keys(),...consumed.keys()]);const conversion=[...comparisonKeys].map(key=>{const [barnId,stageCode]=key.split(':');const gain=gains.get(key)??{gain:0,animals:0};const consumedKg=consumed.get(key)??0;const barnName=animals.options.barns.find(item=>item.id===Number(barnId))?.name??`Galpón ${barnId}`;return {barnId:Number(barnId),barnName,stageCode,periodFrom:from,periodTo:asOf,measuredAnimals:gain.animals,weightGainKg:Number(gain.gain.toFixed(3)),consumedKg:Number(consumedKg.toFixed(3)),feedConversionRatio:gain.gain>0&&consumedKg>0?Number((consumedKg/gain.gain).toFixed(3)):null,unavailableReason:gain.animals===0?'Faltan dos pesajes del mismo animal, galpón y etapa dentro del periodo':gain.gain<=0?'La ganancia comparable debe ser positiva':consumedKg<=0?'Falta registrar consumo real medido en los turnos':null};});
  return {asOf,stages:projection,feeds:feedSummary,conversion,turns:(turns.results??[]).map(row=>({id:Number(row.id),effectiveDate:String(row.effective_date),shiftCode:String(row.shift_code),barnName:String(row.barn_name),stageCode:String(row.stage_code),feedCode:String(row.feed_code),lotCode:String(row.lot_code),plannedKg:Number(row.planned_kg),servedKg:Number(row.served_kg),consumedKg:row.consumed_kg===null?null:Number(row.consumed_kg)}))};
}
