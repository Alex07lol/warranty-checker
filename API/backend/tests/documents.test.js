// Mock Cloudinary and the multer upload middleware so tests never hit the network.
jest.mock("../src/config/cloudinary", () => ({
  uploader: {
    destroy: jest.fn().mockResolvedValue({ result: "ok" })
  }
}));

// This mock mirrors the REAL req.file shape produced by multer-storage-cloudinary
// v4 (installed version). The storage engine only sets { path, size, filename }
// (filename === Cloudinary public_id); multer itself adds originalname/mimetype.
// There is deliberately NO `public_id`/`secure_url`/`bytes` field, because v4 no
// longer spreads the full Cloudinary response onto req.file. The service must
// derive publicId from `filename` — if that mapping regresses, the upload below
// fails with a 422 "Path `publicId` is required."
jest.mock("../src/middleware/upload", () => ({
  uploadSingle: (req, res, next) => {
    req.file = {
      fieldname: "file",
      originalname: "receipt.jpg",
      encoding: "7bit",
      mimetype: "image/jpeg",
      size: 1024,
      path: "https://res.cloudinary.com/test/image/upload/v1/test/receipt123",
      filename: "test/receipt123"
    };
    return next();
  }
}));

// Uploading a receipt now fires background OCR (processDocument) asynchronously.
// Mock tesseract.js and stub global.fetch so that background OCR never touches
// the real network in this suite.
jest.mock("tesseract.js", () => ({
  createWorker: jest.fn(async () => ({
    recognize: jest.fn(async () => ({ data: { text: "ACME STORE\nTotal $899.99\n" } }))
  }))
}));

const originalFetch = global.fetch;
const cloudinary = require("../src/config/cloudinary");

const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

describe("Document API", () => {
  let token;
  let productId;

  beforeAll(async () => {
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    await startDb();
    const user = await registerUser("Doc User", `doc_${Date.now()}@example.com`);
    token = user.token;
    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Refrigerator" });
    productId = product.body.data._id;
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await stopDb();
  });

  test("requires authentication", async () => {
    const response = await request(app).get(
      `/api/v1/products/${productId}/documents`
    );
    expect(response.statusCode).toBe(401);
  });

  test("uploads a document", async () => {
    const response = await request(app)
      .post(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "receipt", notes: "Original bill" });
    expect(response.statusCode).toBe(201);
    expect(response.body.data.documentType).toBe("receipt");
    // Field mapping must survive the multer-storage-cloudinary v4 req.file
    // shape (storage sets only path/size/filename).
    expect(response.body.data.fileUrl).toBe(
      "https://res.cloudinary.com/test/image/upload/v1/test/receipt123"
    );
    expect(response.body.data.fileName).toBe("receipt.jpg");
    expect(response.body.data.fileSize).toBe(1024);
    expect(response.body.data.mimeType).toBe("image/jpeg");
    // Regression guard: publicId must come from req.file.filename when the
    // v4 storage engine does not provide public_id.
    expect(response.body.data.publicId).toBe("test/receipt123");
  });

  test("validates document type", async () => {
    const response = await request(app)
      .post(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "invalid_type" });
    expect(response.statusCode).toBe(422);
  });

  test("lists documents for a product", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.documents).toHaveLength(1);
    expect(response.body.data.documents[0].documentType).toBe("receipt");
  });

  test("deletes a document", async () => {
    const list = await request(app)
      .get(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`);
    const documentId = list.body.data.documents[0]._id;

    const response = await request(app)
      .delete(`/api/v1/products/${productId}/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);

    const after = await request(app)
      .get(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.body.data.documents).toHaveLength(0);

    // The publicId persisted from the v4 filename must drive the Cloudinary
    // destroy call — this closes the loop on the v4 field mapping.
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith("test/receipt123", {
      resource_type: "image"
    });
  });
});
