import { ApiError, commitOperation, createOperationClaim, currentFarmDate, isValidDateString, lookupExistingOperation, normalizeReason } from './events';
import { getConfigSnapshot } from './config';

type Row = Record<string, unknown>;
export interface FeedScope { allowedBarnNames?: string[] | null }
export type FeedMovementInput = {
  movementType?: unknown; effectiveDate?: unknown; warehouseId?: unknown; feedCode?: unknown; lotCode?: unknown;
  supplier?: unknown; quantityKg?: unknown; costPerKg?: unknown; destinationBarnId?: unknown; animalCode?: unknown;
  reason?: unknown; operationKey?: string;
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
    HAVING m.feed_code IS NOT NULL AND available_kg<>0 ORDER BY w.code,m.feed_code,m.lot_code`).bind(asOf,...allowed.params).all<Row>();
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
  return (rows.results??[]).map(row=>({id:Number(row.id),movementType:String(row.movement_type),effectiveDate:String(row.effective_date),warehouseCode:String(row.warehouse_code),warehouseName:String(row.warehouse_name),feedCode:String(row.feed_code),lotCode:String(row.lot_code),supplier:row.supplier===null?null:String(row.supplier),quantityKg:Number(row.quantity_kg),stockDeltaKg:Number(row.stock_delta_kg),costPerKg:Number(row.unit_cost_minor)/100,totalCost:Number(row.total_cost_minor)/100,destinationBarn:row.destination_barn_name===null?null:String(row.destination_barn_name),animalCode:row.animal_code===null?null:String(row.animal_code),reason:String(row.reason),actorName:String(row.actor_name)}));
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
  if(movementType==='waste'&&!reason)throw new ApiError(400,'Indique el motivo de la merma');
  const payload={movementType,effectiveDate,warehouseId,feedCode,lotCode,supplier,quantityKg,costPerKg,destinationBarnId,animalId,reason};
  const replay=await lookupExistingOperation(db,actorUserId,input.operationKey,payload);
  if(replay)return {replayed:true,movement:replay.result};
  const id=Date.now()*1000+Math.floor(Math.random()*1000);
  const positive=['opening','purchase','return_in'].includes(movementType);const stockDeltaKg=positive?quantityKg:-quantityKg;
  const claim=await createOperationClaim({operationKey:input.operationKey,operationType:`feed.${movementType}`,authorUserId:actorUserId,entityType:'feed_movement',entityId:id,barnId:destinationBarnId??(warehouse.barn_id===null?null:Number(warehouse.barn_id)),effectiveDate,payload,result:{id,movementType,effectiveDate,warehouseId,feedCode,lotCode,quantityKg,stockDeltaKg,costPerKg,totalCost:totalCostMinor/100,destinationBarnId,animalId}});
  const movement={id,movementType,effectiveDate,warehouseId,feedCode,lotCode,supplier,quantityKg,stockDeltaKg,costPerKg,totalCost:totalCostMinor/100,destinationBarnId,animalId,reason};
  const signCheck=db.prepare(`INSERT INTO feed_stock_guard (guard_id)
    SELECT CASE WHEN COALESCE(MIN(running),0)>=0 THEN 0 ELSE -1 END FROM (
      SELECT SUM(stock_delta_kg) OVER (ORDER BY effective_date,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
      FROM feed_movements WHERE warehouse_id=? AND feed_code=? AND lot_code=?)`).bind(warehouseId,feedCode,lotCode);
  await commitOperation(db,claim,[db.prepare(`INSERT INTO feed_movements(id,operation_log_id,warehouse_id,movement_type,effective_date,feed_code,lot_code,supplier,quantity_kg,stock_delta_kg,unit_cost_minor,total_cost_minor,destination_barn_id,animal_id,reason,created_by_user_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,claim.id,warehouseId,movementType,effectiveDate,feedCode,lotCode,supplier,quantityKg,stockDeltaKg,unitCostMinor,totalCostMinor,destinationBarnId,animalId,reason,actorUserId,claim.recordedAt),signCheck,db.prepare('DELETE FROM feed_stock_guard')],
    [{entityType:'feed_movement',entityId:id,action:'create',actorUserId,barnId:destinationBarnId??(warehouse.barn_id===null?null:Number(warehouse.barn_id)),reason,previousData:null,newData:movement,effectiveDate,recordedAt:claim.recordedAt}]);
  return {replayed:false,movement};
}
