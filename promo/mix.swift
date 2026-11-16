// Lays a sound track under a finished film without touching the picture: both are copied as they are.
// Usage: swift mix.swift <film.mp4> <sound.m4a> <out.mp4>
import AVFoundation

let arguments = CommandLine.arguments
let film = AVURLAsset(url: URL(fileURLWithPath: arguments[1]))
let sound = AVURLAsset(url: URL(fileURLWithPath: arguments[2]))
let out = URL(fileURLWithPath: arguments[3])

let picture = try await film.loadTracks(withMediaType: .video)[0]
let track = try await sound.loadTracks(withMediaType: .audio)[0]
// The film sets the length. The sound is made a little longer, and is cut where the picture ends.
let length = try await film.load(.duration)
let whole = CMTimeRange(start: .zero, duration: length)

let both = AVMutableComposition()
try both.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
  .insertTimeRange(whole, of: picture, at: .zero)
try both.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
  .insertTimeRange(whole, of: track, at: .zero)

try? FileManager.default.removeItem(at: out)
let export = AVAssetExportSession(asset: both, presetName: AVAssetExportPresetPassthrough)!
export.outputURL = out
export.outputFileType = .mp4
await export.export()
if export.status == .completed {
  let made = AVURLAsset(url: out)
  let pictures = try await made.loadTracks(withMediaType: .video).count
  let sounds = try await made.loadTracks(withMediaType: .audio).count
  print("wrote \(out.lastPathComponent): \(CMTimeGetSeconds(length)) s, \(pictures) picture track, \(sounds) sound track")
} else {
  print("FAILED: \(String(describing: export.error))")
  exit(1)
}
