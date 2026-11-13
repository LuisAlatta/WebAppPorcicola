import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

describe('Convención global de botones', () => {
  it('marca todos los guardados y regresos sin afectar buscadores o inicio de sesión', () => {
    const missing: string[] = [];
    let saves = 0;
    let backs = 0;
    for (const path of sourceFiles('src/components')) {
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'button') {
          const opening = node.openingElement.getText(source);
          const content = node.children.map(child => child.getText(source)).join('');
          if (opening.includes('data-action="save"')) saves++;
          if (/data-action=("back"|\{.*'back')/.test(opening)) backs++;
          const save = /guardar|guardando/i.test(content) || (/type="submit"/.test(opening) && !/BocetoLogin|InformesProductivos/.test(path) && !/Buscar|Aplicar filtros/.test(opening + content));
          const back = /Volver|Regresar|Cancelar|Salir de edición/.test(content) && !/Volver a intentar|Cancelar vacuna/.test(opening + content);
          if ((save || back) && !opening.includes('data-action=')) missing.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(missing).toEqual([]);
    expect(saves).toBeGreaterThan(40);
    expect(backs).toBeGreaterThan(30);
  });

  it('centraliza el texto sin iconos y la alineación izquierda/derecha', () => {
    const css = readFileSync('src/style.css', 'utf8');
    expect(css).toContain('button:is([data-action="save"], [data-action="back"]) svg { display: none; }');
    expect(css).toContain('button[data-action="back"] { order: -1; margin-inline-start: 0; margin-inline-end: auto; justify-self: start; }');
    expect(css).toContain('button[data-action="save"] { order: 1; margin-inline-start: auto; margin-inline-end: 0; justify-self: end; }');
    expect(css).toContain(':is(.form-actions, .modal-actions):has(> button[data-action])');
  });

  it('el regreso de la cabecera tiene texto visible, no un botón vacío', () => {
    const navbar = readFileSync('src/components/Navbar.tsx', 'utf8');
    expect(navbar).toContain('>Regresar</button>');
    expect(navbar).not.toContain('<IconArrowLeft');
  });
});
