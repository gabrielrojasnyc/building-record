// Turns filmed frames into an MP4 that LinkedIn and X accept, with what macOS already has: no ffmpeg.
// Usage: swift encode.swift <frames folder> <out.mp4> [frames a second]
// The folder holds 000000.jpg, 000001.jpg and so on, and times.txt: one line per frame, its time in
// milliseconds from the first. Frames arrive unevenly, so each moment of the film shows the latest one before it.
import AVFoundation
import CoreGraphics
import ImageIO

let arguments = CommandLine.arguments
let folder = URL(fileURLWithPath: arguments[1])
let out = URL(fileURLWithPath: arguments[2])
let rate = arguments.count > 3 ? Int32(arguments[3])! : 30

let times = try String(contentsOf: folder.appendingPathComponent("times.txt"), encoding: .utf8)
  .split(separator: "\n").map { Double($0)! }

func frame(_ index: Int) -> CGImage {
  let file = folder.appendingPathComponent(String(format: "%06d.jpg", index))
  let source = CGImageSourceCreateWithURL(file as CFURL, nil)!
  return CGImageSourceCreateImageAtIndex(source, 0, nil)!
}

let first = frame(0)
let (width, height) = (first.width, first.height)
try? FileManager.default.removeItem(at: out)

let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(
  mediaType: .video,
  outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoColorPropertiesKey: [
      AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
      AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
      AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
    AVVideoCompressionPropertiesKey: [
      // Sharp at 1080p, and a 25 second film stays under the 30 MB that the Claude app can send to a phone.
      AVVideoAverageBitRateKey: 9_000_000,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      AVVideoMaxKeyFrameIntervalKey: rate * 2,
    ],
  ])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: input,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
  ])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let total = Int(times.last! / 1000 * Double(rate))
var latest = 0
var drawn = -1
var pixels: CVPixelBuffer?
for moment in 0..<total {
  let at = Double(moment) / Double(rate) * 1000
  while latest + 1 < times.count && times[latest + 1] <= at { latest += 1 }
  if latest != drawn {
    var made: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &made)
    CVPixelBufferLockBaseAddress(made!, [])
    let canvas = CGContext(
      data: CVPixelBufferGetBaseAddress(made!), width: width, height: height, bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(made!), space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    canvas.draw(frame(latest), in: CGRect(x: 0, y: 0, width: width, height: height))
    CVPixelBufferUnlockBaseAddress(made!, [])
    pixels = made
    drawn = latest
  }
  while !input.isReadyForMoreMediaData { usleep(2000) }
  adaptor.append(pixels!, withPresentationTime: CMTime(value: CMTimeValue(moment), timescale: rate))
}

input.markAsFinished()
let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()
if writer.status == .completed {
  print("wrote \(out.lastPathComponent): \(total) frames at \(rate) a second, \(width)x\(height)")
} else {
  print("FAILED: \(String(describing: writer.error))")
  exit(1)
}
