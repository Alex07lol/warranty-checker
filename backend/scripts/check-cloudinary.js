const cloudinary = require("../src/config/cloudinary");

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

function uploadBuffer(buffer) {
  const publicId = `cloudinary-check-${Date.now()}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "warrantyvault/health-check",
        public_id: publicId,
        resource_type: "image",
        overwrite: false
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
}

async function main() {
  if (!cloudinary.isConfigured()) {
    throw new Error(
      "Cloudinary credentials are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend/.env."
    );
  }

  await cloudinary.api.ping();
  process.stdout.write("Cloudinary credentials authenticated\n");

  const uploaded = await uploadBuffer(ONE_PIXEL_PNG);
  process.stdout.write(`Uploaded test asset: ${uploaded.public_id}\n`);

  await cloudinary.uploader.destroy(uploaded.public_id, {
    resource_type: uploaded.resource_type || "image"
  });
  process.stdout.write("Deleted test asset successfully\n");
}

main().catch((error) => {
  if (error.http_code === 403) {
    process.stderr.write(
      "Cloudinary authenticated, but the upload endpoint returned 403. Check that this API key is allowed to upload assets for this cloud/product environment.\n"
    );
  }
  process.stderr.write(`${error.message}\n`);
  if (error.http_code) {
    process.stderr.write(`Cloudinary HTTP code: ${error.http_code}\n`);
  }
  if (error.error && error.error.message) {
    process.stderr.write(`Cloudinary error: ${error.error.message}\n`);
  }
  process.exit(1);
});
