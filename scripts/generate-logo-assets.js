const sharp = require("sharp");
const path = require("path");

const SRC = path.join(__dirname, "..", "logo.png");
const OUT = path.join(__dirname, "..", "assets", "images");

// logo.png already has real alpha transparency (confirmed via raw pixel
// sampling — it's not a flat white background, that was just the image
// viewer's own white page showing through). So every variant below composites
// the source directly using its real alpha, rather than reconstructing a
// mask from luminance (which produced a garbled result on the first attempt —
// the wordmark's thin rule lines and small text turn to noise once resized
// down, and the logo's own diagonal cutout detail was misread as background).

async function main() {
  const meta = await sharp(SRC).metadata();

  async function composeOnColor(size, background, scale) {
    const targetW = Math.round(size * scale);
    const targetH = Math.round((meta.height / meta.width) * targetW);
    const resizedLogo = await sharp(SRC).resize(targetW, targetH).toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background } })
      .composite([{ input: resizedLogo, gravity: "center" }])
      .png()
      .toBuffer();
  }

  // App icon + favicon — logo on white (matches the logo's own light-mode design).
  const icon = await composeOnColor(1024, { r: 255, g: 255, b: 255, alpha: 1 }, 0.72);
  await sharp(icon).toFile(path.join(OUT, "icon.png"));
  await sharp(icon).resize(48, 48).toFile(path.join(OUT, "favicon.png"));

  // Adaptive icon: foreground (logo, transparent, safe-zone padded) + plain
  // white background layer, composited together by Android itself at runtime.
  const foreground = await composeOnColor(512, { r: 0, g: 0, b: 0, alpha: 0 }, 0.55);
  await sharp(foreground).toFile(path.join(OUT, "android-icon-foreground.png"));
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .png()
    .toFile(path.join(OUT, "android-icon-background.png"));

  // Splash — logo on transparent bg; the splash-screen plugin composites
  // this onto its own configured backgroundColor.
  const splashLogo = await sharp(SRC).resize(200, null, { fit: "inside" }).toBuffer();
  await sharp({ create: { width: 228, height: 228, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: splashLogo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT, "splash-icon.png"));

  // Monochrome (Android 13+ themed icon) + notification icon — Android
  // renders both as a flat white silhouette regardless of source color, so
  // build that directly from the logo's real alpha channel: solid white RGB,
  // original alpha preserved untouched.
  async function whiteSilhouette(size) {
    const targetW = Math.round(size * 0.75);
    const resized = sharp(SRC).resize(targetW, null, { fit: "inside" }).ensureAlpha();
    const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
    const alpha = Buffer.alloc(info.width * info.height);
    for (let i = 0; i < info.width * info.height; i++) {
      alpha[i] = data[i * info.channels + 3];
    }
    const white = Buffer.alloc(info.width * info.height * 3, 255);
    const rgba = await sharp(white, { raw: { width: info.width, height: info.height, channels: 3 } })
      .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
      .png()
      .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: rgba, gravity: "center" }])
      .png()
      .toBuffer();
  }

  const monochrome = await whiteSilhouette(432);
  await sharp(monochrome).toFile(path.join(OUT, "android-icon-monochrome.png"));

  const notifIcon = await whiteSilhouette(192);
  await sharp(notifIcon).toFile(path.join(OUT, "notification-icon.png"));

  console.log("Generated all logo assets in", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
