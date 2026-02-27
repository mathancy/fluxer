-- Add flags column to channels table for per-channel bitfield flags (e.g. dark mode default for whiteboards)
ALTER TABLE fluxer.channels ADD flags int;
