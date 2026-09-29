"""
Processes — el Trigger se muestra en el nodo Start del swimlane (convención BPMN:
el evento de inicio ES el disparador). Aplica al preview del formulario y a las
cards de procesos creados desde el board.
"""
import pathlib

PATH = pathlib.Path(__file__).parent / "index.html"
src = PATH.read_text(encoding="utf-8")

def apply(old, new, label):
    global src
    count = src.count(old)
    assert count == 1, f"[{label}] esperado 1 match, encontrados {count}"
    src = src.replace(old, new, 1)
    print(f"OK: {label}")

apply(
"""function renderProcessDiagram(containerId, steps, lanes = PROCESS_LANES){""",
"""function renderProcessDiagram(containerId, steps, lanes = PROCESS_LANES, opts = {}){
  // opts.trigger: the event that starts the process — drawn under the Start node (BPMN start event).
  const triggerText = String(opts.trigger || '').trim();
  const wrapLabel = (text, max, maxLines) => {
    const words = text.split(/\\s+/); const lines = []; let cur = '';
    words.forEach(w => {
      if((cur + ' ' + w).trim().length > max){ if(cur) lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    });
    if(cur) lines.push(cur);
    if(lines.length > maxLines){ lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,1}$/, '') + '…'; }
    return lines;
  };""",
"renderProcessDiagram: parámetro opts.trigger")

apply(
"""        <text x="${x}" y="${y + 28}" font-size="10" font-weight="700" text-anchor="middle" fill="var(--muted)">${isEnd ? 'End' : 'Start'}</text>
      </g>`;""",
"""        <text x="${x}" y="${y + 28}" font-size="10" font-weight="700" text-anchor="middle" fill="var(--muted)">${isEnd ? 'End' : 'Start'}</text>
        ${!isEnd && triggerText ? `<title>Trigger: ${esc(triggerText)}</title>` + wrapLabel(triggerText, 24, 2).map((line, li) =>
          `<text x="${x}" y="${y + 40 + li * 10}" font-size="8.5" text-anchor="middle" fill="var(--txt)">${li === 0 ? '⚡ ' : ''}${esc(line)}</text>`).join('') : ''}
      </g>`;""",
"start node: muestra el trigger")

apply(
"""  renderProcessDiagram('pfSwimlane',d.steps,d.lanes);""",
"""  renderProcessDiagram('pfSwimlane',d.steps,d.lanes,{trigger:(document.getElementById('pfTrigger')?.value||'')});""",
"preview del form: pasa el trigger")

apply(
"""      renderProcessDiagram(`procDiagram-${p.id}`, d.steps, d.lanes);""",
"""      renderProcessDiagram(`procDiagram-${p.id}`, d.steps, d.lanes, {trigger: p.trigger_event || ''});""",
"cards del board: pasan el trigger")

apply(
"""              <textarea id="pfTrigger" rows="2" class="pf-textarea"></textarea>""",
"""              <textarea id="pfTrigger" rows="2" class="pf-textarea" oninput="pfRefreshDiagramPreview()"></textarea>""",
"form: el preview se actualiza al escribir el trigger")

PATH.write_text(src, encoding="utf-8")
print("\nEscrito OK.")
