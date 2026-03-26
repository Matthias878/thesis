import React from "react";
import "higlass-multivec";
import { HiGlassComponent } from "higlass";
import { main, viewerFrame } from "../styles/appStyles";

//TODO maybe put back into App.jsx?

export default function Viewer({
  viewerKey,
  onHiGlassRef,
  viewConfig,
  onViewerMouseDown,
  advancedOpen,
}) {
  return (
    <main style={main}>
      <div onMouseDown={onViewerMouseDown} style={viewerFrame(advancedOpen)}>
        <HiGlassComponent
          key={viewerKey}
          ref={onHiGlassRef}
          viewConfig={viewConfig}
          options={{ bounded: true }}
        />
      </div>
    </main>
  );
}