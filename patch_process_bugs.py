import pathlib

PATH = pathlib.Path(__file__).parent / 'index.html'
src = PATH.read_text(encoding='utf-8')

def apply(old, new, label):
    global src
    count = src.count(old)
    assert count == 1, f"[{label}] esperado 1 match, encontrados {count}"
    src = src.replace(old, new, 1)
    print(f"OK: {label}")

# 1. CSS: agregar toolbar CSS + transform-origin al SVG del swimlane
apply(
""".pf-swimlane-container{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:flex-start;padding:.5rem}.pf-swimlane-container .proc-diagram-svg{min-width:100%;height:auto}""",
""".pf-swimlane-container{flex:1;overflow:hidden;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;padding:0}.pf-swimlane-inner{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:flex-start;padding:.5rem}.pf-swimlane-toolbar{display:flex;align-items:center;gap:4px;padding:.28rem .5rem;border-bottom:1px solid var(--brd);background:var(--card);flex-shrink:0}.pf-swimlane-toolbar button{border:1px solid var(--brd);background:var(--surf);color:var(--txt);border-radius:5px;padding:.1rem .5rem;cursor:pointer;font-size:.82rem;line-height:1.5;transition:background .12s}.pf-swimlane-toolbar button:hover{background:var(--hov)}.pf-swimlane-toolbar .pf-zoom-pct{font-size:.72rem;color:var(--muted);min-width:2.8rem;text-align:center;user-select:none}.pf-swimlane-container .proc-diagram-svg{min-width:100%;height:auto;transform-origin:0 0;transition:transform .08s}""",
"css swimlane toolbar + transform-origin"
)

# 2. HTML: agregar toolbar de zoom sobre el contenedor del swimlane
apply(
"""      <div class="pf-split-left" id="pfCanvasSection">
        <div class="pf-swimlane-container" id="pfSwimlane">
          <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:.84rem;text-align:center;padding:2rem">Add steps to generate<br>the swimlane diagram</div>
        </div>
      </div>""",
"""      <div class="pf-split-left" id="pfCanvasSection">
        <div class="pf-swimlane-container" id="pfSwimlaneWrap">
          <div class="pf-swimlane-toolbar">
            <button type="button" onclick="pfZoomOut()" title="Zoom out">−</button>
            <span class="pf-zoom-pct" id="pfZoomLabel">100%</span>
            <button type="button" onclick="pfZoomIn()" title="Zoom in">+</button>
            <button type="button" onclick="pfZoomReset()" title="Reset zoom" style="font-size:.7rem;padding:.1rem .45rem">&#x229F; Reset</button>
          </div>
          <div class="pf-swimlane-inner" id="pfSwimlane">
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:.84rem;text-align:center;padding:2rem">Add steps to generate<br>the swimlane diagram</div>
          </div>
        </div>
      </div>""",
"html: toolbar zoom + pf-swimlane-inner"
)

# 3. JS: agregar parámetro forDiagram a pfCollectSteps
apply(
"""function pfCollectSteps(){""",
"""function pfCollectSteps(forDiagram){""",
"pfCollectSteps: agregar parámetro forDiagram"
)

# 4. JS: pfCollectSteps acepta flag forDiagram y usa "Step N" como fallback
apply(
"""  }).filter(s=>s.title);
}
function pfCollectValidations(){""",
"""  }).filter(s=>forDiagram||s.title).map(s=>forDiagram?Object.assign({},s,{title:s.title||('Step '+s.id)}):s);
}
function pfCollectValidations(){""",
"pfCollectSteps: forDiagram flag + Step N fallback"
)

# 5. pfRenderSwimlanes: llamar pfCollectSteps(true) para el diagram preview
apply(
"""  const steps=pfCollectSteps();""",
"""  const steps=pfCollectSteps(true);""",
"pfRenderSwimlanes: usa pfCollectSteps(true)"
)

# 6. pfRenderSwimlanes: aplicar zoom después de renderizar
apply(
"""  renderProcessDiagram('pfSwimlane',d.steps,d.lanes);
}""",
"""  renderProcessDiagram('pfSwimlane',d.steps,d.lanes);
  pfApplySwimlaneZoom();
}""",
"pfRenderSwimlanes: apply zoom after render"
)

# 7. Agregar variable _pfZoom cerca de _pfPreviewTimer
apply(
"""let _pfPreviewTimer = null;""",
"""let _pfPreviewTimer = null;
let _pfZoom = 1;""",
"zoom state variable"
)

# 8. Agregar funciones de zoom después de pfRefreshDiagramPreview
apply(
"""function pfRefreshDiagramPreview(){
  clearTimeout(_pfPreviewTimer);
  _pfPreviewTimer=setTimeout(pfRenderSwimlanes,320);
}""",
"""function pfRefreshDiagramPreview(){
  clearTimeout(_pfPreviewTimer);
  _pfPreviewTimer=setTimeout(pfRenderSwimlanes,320);
}
function pfApplySwimlaneZoom(){
  const svg=document.querySelector('#pfSwimlane .proc-diagram-svg');
  if(svg)svg.style.transform='scale('+_pfZoom+')';
  const lbl=document.getElementById('pfZoomLabel');
  if(lbl)lbl.textContent=Math.round(_pfZoom*100)+'%';
}
function pfZoomIn(){_pfZoom=Math.min(4,parseFloat((_pfZoom*1.2).toFixed(2)));pfApplySwimlaneZoom();}
function pfZoomOut(){_pfZoom=Math.max(.2,parseFloat((_pfZoom/1.2).toFixed(2)));pfApplySwimlaneZoom();}
function pfZoomReset(){_pfZoom=1;pfApplySwimlaneZoom();}
window.pfApplySwimlaneZoom=pfApplySwimlaneZoom;
window.pfZoomIn=pfZoomIn;window.pfZoomOut=pfZoomOut;window.pfZoomReset=pfZoomReset;""",
"zoom functions: pfApplySwimlaneZoom / pfZoomIn / pfZoomOut / pfZoomReset"
)

# 9. En openProcessForm: agregar wheel listener + resetear zoom al abrir
apply(
"""    if(stepsList && !stepsList.dataset.pfPreviewWired){
      stepsList.dataset.pfPreviewWired = '1';
      stepsList.addEventListener('input', () => pfRefreshDiagramPreview());
      stepsList.addEventListener('change', () => pfRefreshDiagramPreview());
    }
    setTimeout(pfRefreshDiagramPreview, 80);
    pfRenderSwimlanes();""",
"""    if(stepsList && !stepsList.dataset.pfPreviewWired){
      stepsList.dataset.pfPreviewWired = '1';
      stepsList.addEventListener('input', () => pfRefreshDiagramPreview());
      stepsList.addEventListener('change', () => pfRefreshDiagramPreview());
    }
    // Wheel zoom en el swimlane (wired una sola vez por modal)
    const swimlaneInner = document.getElementById('pfSwimlane');
    if(swimlaneInner && !swimlaneInner.dataset.pfZoomWired){
      swimlaneInner.dataset.pfZoomWired = '1';
      swimlaneInner.addEventListener('wheel', function(e){
        e.preventDefault();
        _pfZoom = Math.min(4, Math.max(.2, parseFloat((_pfZoom * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2))));
        pfApplySwimlaneZoom();
      }, {passive:false});
    }
    _pfZoom = 1; // resetear zoom al abrir
    setTimeout(pfRefreshDiagramPreview, 80);
    pfRenderSwimlanes();""",
"openProcessForm: wheel zoom + reset al abrir"
)

PATH.write_text(src, encoding='utf-8')
print("\nEscrito OK.")
