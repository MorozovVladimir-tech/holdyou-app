const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, '../assets/images/icon_orb.png');
const tmpPath = path.join(__dirname, '../assets/images/icon_orb_tmp.png');

const scaleFactor = 1.18;
const size = 1024;
const scaledSize = Math.round(size * scaleFactor);
const offset = Math.floor((scaledSize - size) / 2);

sharp(inputPath)
  .resize(scaledSize, scaledSize)
  .extract({ left: offset, top: offset, width: size, height: size })
  .toFile(tmpPath)
  .then(() => {
    fs.renameSync(tmpPath, inputPath);
    console.log('Done');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
