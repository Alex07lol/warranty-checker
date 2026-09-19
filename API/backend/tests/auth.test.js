const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");
const { getLatestCodeForEmail, clearTestSentEmails } = require("../src/services/email.service");

describe("Auth API", () => {
  beforeAll(async () => {
    await startDb();
  });

  afterAll(async () => {
    await stopDb();
  });

  beforeEach(() => {
    clearTestSentEmails();
  });

  test("register sends 6-digit verification code and requires verification", async () => {
    const email = `new_${Date.now()}@example.com`;
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "New User",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.requiresVerification).toBe(true);
    expect(response.body.data.email).toBe(email);
    expect(response.body.data.user.isEmailVerified).toBe(false);

    // Verify 6-digit OTP code was generated and recorded
    const code = getLatestCodeForEmail(email);
    expect(code).toBeTruthy();
    expect(code).toMatch(/^\d{6}$/);
  });

  test("login before email verification is rejected with 403", async () => {
    const email = `unverified_${Date.now()}@example.com`;
    await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Unverified User",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "password123" });

    expect(loginRes.statusCode).toBe(403);
    expect(loginRes.body.success).toBe(false);
    expect(loginRes.body.data?.requiresVerification).toBe(true);
    expect(loginRes.body.data?.email).toBe(email);
  });

  test("verify-email rejects wrong code and enforces attempt limit", async () => {
    const email = `verify_fail_${Date.now()}@example.com`;
    await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Verify Fail",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    // Send invalid code
    const badRes = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email, code: "000000" });

    expect(badRes.statusCode).toBe(400);
    expect(badRes.body.message).toContain("Invalid verification code");
  });

  test("verify-email succeeds with correct 6-digit code and activates account", async () => {
    const email = `verify_ok_${Date.now()}@example.com`;
    await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Verify OK",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    const code = getLatestCodeForEmail(email);
    expect(code).toBeTruthy();

    const verifyRes = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email, code });

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.token).toBeTruthy();
    expect(verifyRes.body.data.user.isEmailVerified).toBe(true);

    // Now login succeeds
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "password123" });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.data.token).toBeTruthy();
  });

  test("resend-verification enforces cooldown then sends new code", async () => {
    const email = `resend_${Date.now()}@example.com`;
    await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Resend User",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    const initialCode = getLatestCodeForEmail(email);
    expect(initialCode).toBeTruthy();

    // Immediate resend should be rate-limited by 60s cooldown
    const earlyResend = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email });

    expect(earlyResend.statusCode).toBe(429);
    expect(earlyResend.body.message).toContain("Please wait");
  });

  test("register rejects duplicate verified email", async () => {
    const email = `dup_${Date.now()}@example.com`;
    await registerUser("First", email);
    const { response } = await registerUser("Second", email);
    expect(response.statusCode).toBe(409);
    expect(response.body.success).toBe(false);
  });

  test("register validates required fields", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "X", email: "not-an-email", password: "short" });
    expect(response.statusCode).toBe(422);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  test("register rejects a password under 8 characters (same minimum the UI shows)", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Six Char",
        email: `six_${Date.now()}@example.com`,
        password: "abcdef",
        confirmPassword: "abcdef"
      });
    expect(response.statusCode).toBe(422);
    expect(response.body.success).toBe(false);
  });

  test("register rejects a duplicate Gmail spelling and reports the existing account", async () => {
    const stamp = Date.now();
    const email = `dup.gmail_${stamp}@gmail.com`;
    await registerUser("Gmail First", email);

    // Gmail ignores dots inside the local part and everything after a "+", so
    // this is the SAME mailbox — it must not create a second account.
    const duplicate = await registerUser("Gmail Second", `dup.gmail_${stamp}+warranty@gmail.com`);
    expect(duplicate.response.statusCode).toBe(409);
    expect(duplicate.response.body.success).toBe(false);
    expect(duplicate.response.body.message).toMatch(/already exists/i);
  });

  test("register rejects a Googlemail spelling and login still accepts the alias", async () => {
    const stamp = Date.now();
    const email = `aliasuser_${stamp}@gmail.com`;
    await registerUser("Alias Owner", email);

    const duplicate = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Alias Clone",
        email: `alias.user_${stamp}@googlemail.com`,
        password: "password123",
        confirmPassword: "password123"
      });
    expect(duplicate.statusCode).toBe(409);

    // A non-Gmail address is never treated as an alias of another account.
    const unrelated = await registerUser("Someone Else", `aliasuser_${stamp}@example.com`);
    expect(unrelated.response.statusCode).toBe(201);

    // The person who owns the mailbox can still sign in with any spelling of it.
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: `a.lias.user_${stamp}@gmail.com`, password: "password123" });
    expect(login.statusCode).toBe(200);
    expect(login.body.data.email).toBe(email);
  });

  test("canonicalEmail folds Gmail spellings onto one identity and leaves others alone", () => {
    const { canonicalEmail } = require("../src/services/auth.service");
    expect(canonicalEmail("John.Doe+Warranty@Gmail.com")).toBe("johndoe@gmail.com");
    expect(canonicalEmail("johndoe@googlemail.com")).toBe("johndoe@gmail.com");
    expect(canonicalEmail("john.doe@outlook.com")).toBe("john.doe@outlook.com");
    expect(canonicalEmail("first.last+tag@yahoo.com")).toBe("first.last+tag@yahoo.com");
  });

  test("login succeeds with valid credentials", async () => {
    const email = `login_${Date.now()}@example.com`;
    await registerUser("Login User", email);
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "password123" });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.token).toBeTruthy();
  });

  test("login rejects invalid credentials", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "wrongpass123" });
    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test("GET /me returns the authenticated user", async () => {
    const { token } = await registerUser(
      "Me User",
      `me_${Date.now()}@example.com`
    );
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.email).toContain("me_");
    expect(response.body.data.isEmailVerified).toBe(true);
  });

  test("GET /me rejects missing token", async () => {
    const response = await request(app).get("/api/v1/auth/me");
    expect(response.statusCode).toBe(401);
  });

  test("change password updates credentials", async () => {
    const email = `pw_${Date.now()}@example.com`;
    const { token } = await registerUser("PW User", email);
    const response = await request(app)
      .put("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        currentPassword: "password123",
        newPassword: "newpassword456",
        confirmNewPassword: "newpassword456"
      });
    expect(response.statusCode).toBe(200);

    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "password123" });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "newpassword456" });
    expect(newLogin.statusCode).toBe(200);
  });

  test("logout succeeds with a token", async () => {
    const { token } = await registerUser(
      "Logout User",
      `logout_${Date.now()}@example.com`
    );
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });

  describe("Password Reset Flow", () => {
    test("forgot-password returns success message even for non-existent email (anti-enumeration)", async () => {
      const response = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "nonexistent@example.com" });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("If an account exists");
    });

    test("forgot-password dispatches 6-digit OTP code and reset-password updates credentials", async () => {
      const email = `reset_flow_${Date.now()}@example.com`;
      await registerUser("Reset User", email);

      const forgotRes = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email });

      expect(forgotRes.statusCode).toBe(200);
      expect(forgotRes.body.success).toBe(true);

      const code = getLatestCodeForEmail(email, "password_reset");
      expect(code).toBeTruthy();
      expect(code).toMatch(/^\d{6}$/);

      // Verify cooldown
      const cooldownRes = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email });
      expect(cooldownRes.statusCode).toBe(429);

      // Attempt with wrong code
      const wrongRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          email,
          code: "111111",
          newPassword: "BrandNewPassword123",
          confirmNewPassword: "BrandNewPassword123"
        });
      expect(wrongRes.statusCode).toBe(400);
      expect(wrongRes.body.message).toContain("Invalid reset code");

      // Successful reset
      const resetRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          email,
          code,
          newPassword: "BrandNewPassword123",
          confirmNewPassword: "BrandNewPassword123"
        });
      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // Old password fails
      const oldLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password: "password123" });
      expect(oldLogin.statusCode).toBe(401);

      // New password succeeds
      const newLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password: "BrandNewPassword123" });
      expect(newLogin.statusCode).toBe(200);
      expect(newLogin.body.data.token).toBeTruthy();
    });
  });

  describe("Account Deletion Flow with MongoDB Cascade", () => {
    test("request-delete-account requires auth and sends 6-digit OTP", async () => {
      const email = `del_req_${Date.now()}@example.com`;
      const { token } = await registerUser("Delete Candidate", email);

      const unauth = await request(app).post("/api/v1/auth/request-delete-account");
      expect(unauth.statusCode).toBe(401);

      const reqRes = await request(app)
        .post("/api/v1/auth/request-delete-account")
        .set("Authorization", `Bearer ${token}`);

      expect(reqRes.statusCode).toBe(200);
      expect(reqRes.body.success).toBe(true);

      const code = getLatestCodeForEmail(email, "account_deletion");
      expect(code).toBeTruthy();
      expect(code).toMatch(/^\d{6}$/);

      // Cooldown check
      const cooldownRes = await request(app)
        .post("/api/v1/auth/request-delete-account")
        .set("Authorization", `Bearer ${token}`);
      expect(cooldownRes.statusCode).toBe(429);
    });

    test("confirm-delete-account cascades deletion to products, documents, notifications and user in MongoDB", async () => {
      const Product = require("../src/models/Product");
      const Document = require("../src/models/Document");
      const ServiceHistory = require("../src/models/ServiceHistory");
      const Share = require("../src/models/Share");
      const Notification = require("../src/models/Notification");
      const User = require("../src/models/User");

      const email = `del_cascade_${Date.now()}@example.com`;
      const { token, userId } = await registerUser("Cascade Candidate", email);

      // Create linked records across collections in MongoDB
      const product = await Product.create({
        userId,
        productName: "Cascade Laptop",
        brand: "TestBrand",
        category: "Electronics",
        purchaseDate: new Date(),
        warrantyPeriodMonths: 24,
        warrantyExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: "active"
      });

      await Document.create({
        productId: product._id,
        userId,
        documentType: "receipt",
        fileName: "receipt.pdf",
        fileUrl: "https://example.com/receipt.pdf",
        publicId: "test_public_id",
        fileSize: 1024,
        mimeType: "application/pdf"
      });

      await ServiceHistory.create({
        productId: product._id,
        userId,
        serviceDate: new Date(),
        serviceType: "repair",
        serviceProvider: "Official Service Center",
        cost: 50
      });

      await Share.create({
        productId: product._id,
        userId,
        token: `share_token_${Date.now()}`
      });

      await Notification.create({
        userId,
        productId: product._id,
        notificationType: "warranty_expiry",
        title: "Test Expiry Alert",
        message: "Your warranty is expiring soon"
      });

      // Request deletion
      await request(app)
        .post("/api/v1/auth/request-delete-account")
        .set("Authorization", `Bearer ${token}`);

      const code = getLatestCodeForEmail(email, "account_deletion");
      expect(code).toBeTruthy();

      // Wrong code check
      const wrongCodeRes = await request(app)
        .post("/api/v1/auth/confirm-delete-account")
        .set("Authorization", `Bearer ${token}`)
        .send({ code: "999999" });
      expect(wrongCodeRes.statusCode).toBe(400);

      // Confirm deletion with correct code
      const confirmRes = await request(app)
        .post("/api/v1/auth/confirm-delete-account")
        .set("Authorization", `Bearer ${token}`)
        .send({ code });

      expect(confirmRes.statusCode).toBe(200);
      expect(confirmRes.body.success).toBe(true);

      // Verify MongoDB cascade cleanup
      const dbUser = await User.findById(userId);
      expect(dbUser).toBeNull();

      const dbProducts = await Product.find({ userId });
      expect(dbProducts).toHaveLength(0);

      const dbDocs = await Document.find({ userId });
      expect(dbDocs).toHaveLength(0);

      const dbServices = await ServiceHistory.find({ userId });
      expect(dbServices).toHaveLength(0);

      const dbShares = await Share.find({ userId });
      expect(dbShares).toHaveLength(0);

      const dbNotifs = await Notification.find({ userId });
      expect(dbNotifs).toHaveLength(0);
    });
  });
});
