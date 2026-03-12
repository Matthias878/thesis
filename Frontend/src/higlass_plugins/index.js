import register from "higlass-register";
import SeqLogoTrack from "./SeqLogoTrack";
import SequenceTextTrack from "./SequenceTextTrack";

register({
  name: "seqlogo",
  track: SeqLogoTrack,
  config: SeqLogoTrack.config,
});

register({
  name: "sequence-text",
  track: SequenceTextTrack,
  config: SequenceTextTrack.config,
});

export { SeqLogoTrack, SequenceTextTrack };