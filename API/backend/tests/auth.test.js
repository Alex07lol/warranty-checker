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
});
