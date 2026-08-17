// Same-origin bridge into the real draw.io editor's selection API. The
// embed's own postMessage protocol has no "selection changed" event (see
// docs/superpowers/specs/2026-08-11-dfd-node-selection-design.md for the
// grep evidence), but because we self-host /drawio/index.html at our own
// origin, this script — loaded from inside that same page, before draw.io's
// own bundle — can intercept the real EditorUi construction and tap
// mxGraph's actual internal selection model directly.
//
// window.EditorUi is assigned once, by draw.io's own bundle, as a plain
// `var EditorUi = function(...) {...}`. Defining a getter/setter on it
// BEFORE that assignment happens lets us wrap the constructor function the
// instant it's set, so `new EditorUi(...)` (called by draw.io's own
// bootstrap) runs through our wrapper and hands us `this` — the live
// instance — right as it's constructed. Patching AFTER the page loads is
// too late: draw.io constructs and fully initializes EditorUi synchronously
// within one script evaluation, before any polling loop gets a turn.
(function () {
  var realEditorUi;
  Object.defineProperty(window, "EditorUi", {
    configurable: true,
    get: function () {
      return realEditorUi;
    },
    set: function (fn) {
      function WrappedEditorUi() {
        var result = fn.apply(this, arguments);
        onEditorUiReady(this);
        return result;
      }
      WrappedEditorUi.prototype = fn.prototype;
      Object.setPrototypeOf(WrappedEditorUi, fn);
      realEditorUi = WrappedEditorUi;
    },
  });

  function onEditorUiReady(ui) {
    var graph = ui.editor && ui.editor.graph;
    if (!graph || !graph.getSelectionModel) return;

    // Edit mode only - view mode is chromeless (no menu bar to begin with).
    // The Help menu is built from exactly ["keyboardShortcuts", "-",
    // "about"] in this vendored build (grepped from app.min.js) - both
    // entries link out to diagrams.net/GitHub or show the mxGraph "About"
    // dialog, so hiding the whole menu (matched by its visible label, not
    // an internal class name, since those are minified) removes both
    // cleanly without touching stock JS behavior. Live-verified the real
    // top-level menu item markup is `<a class="geItem">Help</a>` - a plain
    // `*` selector (not assuming `div`) avoids re-guessing the tag if a
    // future vendored version changes it.
    if (ui.menubar && ui.menubar.container) {
      var hideHelpMenu = function () {
        var items = ui.menubar.container.querySelectorAll("*");
        for (var i = 0; i < items.length; i++) {
          if (items[i].children.length === 0 && items[i].textContent.trim() === "Help") {
            items[i].style.display = "none";
            return true;
          }
        }
        return false;
      };
      if (!hideHelpMenu()) {
        // Menu bar items can render a tick after construction in some
        // builds - one retry on the next frame covers that without a
        // polling loop.
        requestAnimationFrame(hideHelpMenu);
      }
    }

    // DfdEditorFrame's "view" mode passes chrome=0. Traced the real gate,
    // live, in this vendored build: EditorUi's own init code wraps
    // `graph.isEnabled` in a closure that also requires an internal
    // "locked" check, which is true for our chromeless/view-mode load —
    // confirmed directly: graph.enabled (the plain flag) reads true, but
    // graph.isEnabled() (the wrapped method) reads false, and mxGraph's
    // whole mouse pipeline (mouseDown, click, drag) gates on isEnabled(),
    // not the plain flag, at multiple points — so neither setEnabled(true)
    // nor overriding just Graph.prototype.click was enough; the pipeline
    // exits at mouseDown before click is ever reached.
    //
    // The direct, guaranteed fix: this callback runs after draw.io's own
    // constructor (and its isEnabled wrapping) has already completed, so a
    // plain reassignment here is simply the last write and wins outright —
    // no need to reverse-engineer what the wrapped closure actually
    // checks. Every mutation path (move/delete/edit/connect) is then
    // explicitly re-locked via mxGraph's own granular per-cell flags,
    // which are independent of isEnabled() — so "view-only" still means
    // the diagram genuinely can't be changed, just that selecting a cell
    // to inspect it works again.
    var isViewMode = new URLSearchParams(window.location.search).get("chrome") === "0";
    if (isViewMode) {
      graph.isEnabled = function () {
        return true;
      };
      graph.setCellsMovable(false);
      graph.setCellsDeletable(false);
      graph.setCellsEditable(false);
      graph.setConnectable(false);
    }

    // Expose the live instance on the iframe's own window. Attack-surface
    // identification is a graded step driven entirely by selecting cells, and
    // without a handle there is no way to drive that selection from a test —
    // clicking blind at canvas coordinates is not a check anyone can trust.
    // Same-origin only, and the parent frame already controls this editor.
    window.__dfdEditor = { ui: ui, graph: graph };

    graph.getSelectionModel().addListener(mxEvent.CHANGE, function () {
      var cells = graph.getSelectionCells();
      var payload = { event: "dfd-selection", kind: null, id: null };

      if (cells.length === 1) {
        var cell = cells[0];
        // Our compiler wraps every node/edge/boundary in an <object
        // dfdKind="...">, which mxGraph parses so the object element
        // itself becomes the cell's value — cell.getAttribute reads its
        // attributes directly, the same way draw.io's own Edit Data
        // dialog does. A freehand cell (drawn from the shape library, not
        // our compiler) has no dfdKind and falls through to the null case.
        var kind = cell.getAttribute ? cell.getAttribute("dfdKind", null) : null;
        if (kind === "node" || kind === "edge") {
          payload.kind = kind;
          payload.id = cell.id;
        }
      }

      window.parent.postMessage(JSON.stringify(payload), "*");
    });
  }
})();
