// Mock Cloudinary and the multer upload middleware so tests never hit the network.
jest.mock("../../src/config/cloudinary", () => ({
  uploader: {
    destroy: jest.fn().mockResolvedValue({ result: "ok" })
  }
}));

jest.mock("../../src/middleware/upload", () => ({
  uploadSingle: (req, res, next) => {
    req.file = {
      original_filename: "receipt.jpg",
      originalname: "receipt.jpg",
      filename: "receipt.jpg",
      path: "https://res.cloudinary.com/test/image/upload/v1/receipt.jpg",
      secure_url: "https://res.cloudinary.com/test/image/upload/v1/receipt.jpg",
      public_id: "test/receipt123",
      bytes: 1024,
      size: 1024,
      mimetype: "image/jpeg"
    };
    return next();
  }
}));

const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

describe("Document API", () => {
  let token;
  let productId;

  beforeAll(async () => {
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
    expect(response.body.data.fileUrl).toContain("cloudinary");
    expect(response.body.data.fileName).toBe("receipt.jpg");
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
    expect(response.body.data.documents.length).toBe(1);
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
    expect(after.body.data.documents.length).toBe(0);
  });
});
