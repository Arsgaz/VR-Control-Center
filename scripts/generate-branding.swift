// Run from the repository root on macOS: swift scripts/generate-branding.swift
// Only rasterizes checked-in SVG geometry; no downloads or third-party packages.
import AppKit

let directory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    .appendingPathComponent("resources/branding")
func rasterize(_ svg: String, size: Int) throws -> Data {
    guard let image = NSImage(data: Data(svg.utf8)),
          let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size,
              pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
              isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
          let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw NSError(domain: "IconRendering", code: 1)
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    image.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero,
        operation: .copy, fraction: 1)
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}
func write(_ name: String, _ data: Data) throws {
    try data.write(to: directory.appendingPathComponent(name))
}
func littleEndian<T: FixedWidthInteger>(_ value: T) -> Data {
    var number = value.littleEndian
    return withUnsafeBytes(of: &number) { Data($0) }
}
let appSvg = try String(contentsOf: directory.appendingPathComponent("headset-app.svg"), encoding: .utf8)
try write("icon.png", rasterize(appSvg, size: 1024))
for size in [16, 32, 48, 64, 128, 256, 512] {
    try write("icon-\(size).png", rasterize(appSvg, size: size))
}
func bigEndian(_ value: UInt32) -> Data {
    var number = value.bigEndian
    return withUnsafeBytes(of: &number) { Data($0) }
}
var chunks = Data()
for (kind, size) in [("icp4",16),("icp5",32),("icp6",64),("ic07",128),("ic08",256),("ic09",512),("ic10",1024),("ic11",32),("ic12",64),("ic13",256),("ic14",512)] {
    let png = try rasterize(appSvg, size: size)
    chunks.append(Data(kind.utf8))
    chunks.append(bigEndian(UInt32(png.count + 8)))
    chunks.append(png)
}
try write("icon.icns", Data("icns".utf8) + bigEndian(UInt32(chunks.count + 8)) + chunks)
let sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
let frames = try sizes.map { try rasterize(appSvg, size: $0) }
var ico = littleEndian(UInt16(0)) + littleEndian(UInt16(1)) + littleEndian(UInt16(sizes.count))
var offset = 6 + 16 * sizes.count
for (size, png) in zip(sizes, frames) {
    ico.append(contentsOf: [UInt8(size == 256 ? 0 : size), UInt8(size == 256 ? 0 : size), 0, 0])
    ico.append(littleEndian(UInt16(1)))
    ico.append(littleEndian(UInt16(32)))
    ico.append(littleEndian(UInt32(png.count)))
    ico.append(littleEndian(UInt32(offset)))
    offset += png.count
}
for png in frames { ico.append(png) }
try write("icon.ico", ico)
let mark = try String(contentsOf: directory.appendingPathComponent("headset.svg"), encoding: .utf8)
let paths = String(mark[mark.index(after: mark.firstIndex(of: ">")!)..<mark.range(of: "</svg>")!.lowerBound])
for (name, color) in [("tray", "#f4f5f7"), ("tray-light", "#24262b")] {
    let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\"><g fill=\"\(color)\" transform=\"translate(-13 17) scale(.29)\">\(paths)</g></svg>"
    try write("\(name).png", rasterize(svg, size: 32))
    try write("\(name)@2x.png", rasterize(svg, size: 64))
}
let template = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 64 64\"><g fill=\"black\" transform=\"translate(-13 17) scale(.29)\">\(paths)</g></svg>"
try write("trayTemplate.png", rasterize(template, size: 22))
try write("trayTemplate@2x.png", rasterize(template, size: 44))
print("Generated unified PNG, ICO, ICNS and macOS/Windows tray icons.")
