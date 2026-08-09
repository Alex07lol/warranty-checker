const cloudinary = require("cloudinary").v2;
const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET
} = require("./env");

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

function isPlaceholder(value) {
  return !value || value === "test" || value.startsWith("<");
}

function isConfigured() {
  return ![
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET
  ].some(isPlaceholder);
}

// Cloudinary's Admin API "download" endpoint is authenticated with the
// account's API key/secret (Basic auth) rather than going through the CDN
// delivery URL (res.cloudinary.com) — so it is NOT subject to the media
// delivery ACL that blocks PDFs on this account (401 "deny or ACL failure",
// even with signed URLs). All app uploads use resource_type "auto", which
// stores both images and PDFs as image resources, so "image" is the correct
// resource type for every document.
// Docs: https://cloudinary.com/documentation/admin_api#download
async function fetchStoredAsset(publicId) {
  const url =
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/download` +
    `?public_id=${encodeURIComponent(publicId)}&type=upload`;
  const auth =
    "Basic " +
    Buffer.from(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`).toString("base64");
  // A hung Cloudinary request must not block the proxy response forever.
  return fetch(url, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(30000)
  });
}

cloudinary.isConfigured = isConfigured;
cloudinary.fetchStoredAsset = fetchStoredAsset;

module.exports = cloudinary;
