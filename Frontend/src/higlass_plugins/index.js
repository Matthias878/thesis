// src/index.js
import register from "higlass-register";
import SeqLogoTrack from "./SeqLogoTrack";

register({
  name: "seqlogo",
  track: SeqLogoTrack,
  config: SeqLogoTrack.config,
});

export default SeqLogoTrack;