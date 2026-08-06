import React, { useState } from "react";
import { useDispatch } from "../state/store.js";

export function HelpDialog() {
  const dispatch = useDispatch();
  const [showHelp, setShowHelp] = useState(false);
  const close = () => dispatch({ type: "SET_HELP_DIALOG", open: false });

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className={`modal help-dialog ${showHelp ? "expanded" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="help-about">
          <h2>Parametric CAD</h2>
          <p className="help-tagline">Parametric CAD editor</p>
          <p className="panel-help">
            Draw 2D geometry, drive any dimension from equations in a plain-text params file, export to DXF, and print
            tiled across real paper -- like a KOMPAS-style print-split composer.
          </p>
          <div className="modal-actions" style={{ justifyContent: "space-between" }}>
            <button onClick={() => setShowHelp((v) => !v)}>{showHelp ? "Hide help" : "Help"}</button>
            <button onClick={close}>Close</button>
          </div>
        </div>

        {showHelp && (
          <div className="help-content">
            <h3>Drawing tools</h3>
            <table className="help-table">
              <tbody>
                <tr>
                  <td>
                    <kbd>S</kbd> Select
                  </td>
                  <td>Click an entity or dimension to select it and edit its fields in the Properties panel. Drag a free (non-anchored) point to move it. Delete/Backspace removes the selection.</td>
                </tr>
                <tr>
                  <td>
                    <kbd>L</kbd> Line
                  </td>
                  <td>Click a start point, then an end point.</td>
                </tr>
                <tr>
                  <td>
                    <kbd>C</kbd> Circle
                  </td>
                  <td>Click the center, then click anywhere to set the radius.</td>
                </tr>
                <tr>
                  <td>
                    <kbd>R</kbd> Rectangle
                  </td>
                  <td>Click one corner, then the opposite corner.</td>
                </tr>
                <tr>
                  <td>
                    <kbd>A</kbd> Arc
                  </td>
                  <td>Click the center, then the start point, then the end point.</td>
                </tr>
                <tr>
                  <td>
                    <kbd>P</kbd> Polyline
                  </td>
                  <td>Click each vertex in turn. Double-click, press Enter, or switch tools to finish; Esc cancels the in-progress shape.</td>
                </tr>
                <tr>
                  <td>
                    <kbd>D</kbd> Linear Dim
                  </td>
                  <td>Click a line, then click where to place the dimension line (distance/side sets the offset).</td>
                </tr>
                <tr>
                  <td>
                    <kbd>K</kbd> Radius Dim
                  </td>
                  <td>Click a circle or arc, then click where to place the leader line.</td>
                </tr>
              </tbody>
            </table>

            <h3>Navigating the canvas</h3>
            <ul>
              <li>Scroll to zoom, centered on the cursor.</li>
              <li>Middle-click-drag or right-click-drag pans regardless of the active tool.</li>
              <li>
                Hold <kbd>Space</kbd> and drag with the left mouse button as an alternative (useful on a trackpad).
              </li>
              <li>
                <kbd>S</kbd> always returns to the Select tool, from anywhere.
              </li>
            </ul>

            <h3>Snapping</h3>
            <ul>
              <li>
                <kbd>F3</kbd> Object Snap -- new points snap onto existing geometry (line endpoints, circle/arc centers,
                polyline vertices, rectangle corners). A point placed this way <em>anchors</em> to that geometry, so it
                moves together with it when parameters change.
              </li>
              <li>
                <kbd>F9</kbd> Grid Snap -- when Object Snap doesn't find anything nearby, new points snap to the
                nearest 1&nbsp;mm grid intersection instead of the raw cursor position.
              </li>
              <li>
                Hold <kbd>Shift</kbd> while placing a Line's end point, an Arc's start/end point, or a Polyline's next
                vertex to constrain its direction (from the previous point/center) to the nearest 15&deg; step -- 30,
                45, 60, 90, etc. -- at whatever distance the cursor is at. This overrides Object/Grid Snap for that
                click, since a direction constraint and a position constraint don't combine.
              </li>
            </ul>

            <h3>Parametric dimensions</h3>
            <ul>
              <li>
                <strong>Parameters panel</strong> (left) edits <code>params.txt</code> directly: one{" "}
                <code>name = expression</code> per line. Reference other parameters, e.g. <code>height = width * 0.5 + 20</code>.
                Functions: <code>sin cos tan sqrt abs min max round ...</code> (trig in degrees). Issues (undefined
                variables, circular references) are listed inline.
              </li>
              <li>
                <strong>Properties panel</strong> (right) shows the selected entity's or dimension's fields. Any numeric
                field can be a plain number or a formula starting with <code>=</code> (e.g. <code>=width / 2</code>)
                referencing the params file -- edit the params file and every bound field updates immediately.
              </li>
            </ul>

            <h3>Files</h3>
            <ul>
              <li>
                <strong>New / Open File / Save File</strong> work on a single <code>.pcad.json</code> project file on
                your computer, bundling the drawing and its params text -- unrelated to your account (see Accounts and
                sharing below for cloud saves).
              </li>
              <li>
                <strong>Export DXF</strong> saves the resolved geometry as a DXF file readable by any CAD package.
              </li>
              <li>
                <strong>Print / Export PDF</strong> opens the print composer: pick a paper size, orientation, and
                scale, and it tiles the drawing across as many pages as needed, with overlap/crop marks so printed
                sheets can be aligned and trimmed, plus an assembly index sheet for large drawings.
              </li>
            </ul>

            <h3>Accounts and sharing</h3>
            <ul>
              <li>
                <strong>Sign in</strong> (top right) to save projects to your account instead of only to local files.
              </li>
              <li>
                The project name at the top left is editable -- click it to rename. <strong>☁ Save to Cloud</strong>{" "}
                saves the current project to your account, distinct from <strong>Save File</strong> which downloads a
                local <code>.pcad.json</code> file.
              </li>
              <li>
                The <strong>Projects</strong> button toggles a sidebar listing everything saved to your account --
                click a project to open it, or delete it from there.
              </li>
              <li>
                Every cloud project has a <strong>Private/Public</strong> toggle. Public projects get a copyable share
                link that anyone can open read-only, without signing in.
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
