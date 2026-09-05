const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");
const User = require("../src/models/User");

describe("Auth API", () => {
  beforeAll(async () => {
    await startDb();
  });

  afterAll(async () => {
    await stopDb();
  });

  test("register returns token and user profile via helper", async () => {
    const { response, token } = await registerUser(
      "Test User",
      `user_${Date.now()}@example.com`
    );
    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(token).toBeTruthy();
    expect(response.body.data.user.email).toContain("user_");
    expect(response.body.data.user.name).toBe("Test User");
  });

  test("direct registration sends verification code and marks user unverified", async () => {
    const email = `signup_${Date.now()}@example.com`;
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Signup User",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.requiresVerification).toBe(true);
    expect(response.body.data.user.isEmailVerified).toBe(false);
    expect(response.body.data.verificationCode).toMatch(/^\d{6}$/);

    const dbUser = await User.findOne({ email });
    expect(dbUser.isEmailVerified).toBe(false);
    expect(dbUser.emailVerificationCode).toBe(response.body.data.verificationCode);
  });

  test("verify-email succeeds with valid code and activates account", async () => {
    const email = `verify_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Verify User",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    const code = regRes.body.data.verificationCode;
    const verifyRes = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email, code });

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.token).toBeTruthy();
    expect(verifyRes.body.data.user.isEmailVerified).toBe(true);

    const dbUser = await User.findOne({ email });
    expect(dbUser.isEmailVerified).toBe(true);
    expect(dbUser.emailVerificationCode).toBeNull();
  });

  test("verify-email rejects invalid code", async () => {
    const email = `badcode_${Date.now()}@example.com`;
    await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Bad Code User",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    const verifyRes = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email, code: "999999" });

    expect(verifyRes.statusCode).toBe(400);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.message).toContain("Invalid verification code");
  });

  test("verify-email rejects expired code", async () => {
    const email = `expired_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Expired User",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    const code = regRes.body.data.verificationCode;
    // Backdate expiration
    await User.updateOne({ email }, { emailVerificationExpires: new Date(Date.now() - 60000) });

    const verifyRes = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email, code });

    expect(verifyRes.statusCode).toBe(400);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.message).toContain("expired");
  });

  test("resend-verification generates new code and updates expiry", async () => {
    const email = `resend_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Resend User",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    const initialCode = regRes.body.data.verificationCode;

    const resendRes = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email, type: "email" });

    expect(resendRes.statusCode).toBe(200);
    expect(resendRes.body.success).toBe(true);

    const dbUser = await User.findOne({ email });
    expect(dbUser.emailVerificationCode).toBeTruthy();
  });

  test("unverified user login prompts for email verification", async () => {
    const email = `unverified_login_${Date.now()}@example.com`;
    await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Unverified Login User",
        email,
        password: "password123",
        confirmPassword: "password123"
      });

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "password123" });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.data.requiresVerification).toBe(true);
    expect(loginRes.body.data.verificationType).toBe("email");
    expect(loginRes.body.data.verificationCode).toBeTruthy();
  });

  test("register rejects duplicate email", async () => {
    const email = `dup_${Date.now()}@example.com`;
    await registerUser("First", email);
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Second",
        email,
        password: "password123",
        confirmPassword: "password123"
      });
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

  test("login flow triggers login verification and verify-login succeeds", async () => {
    const email = `login_${Date.now()}@example.com`;
    await registerUser("Login User", email);

    // Step 1: Initiating login triggers verification code email
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "password123" });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.data.requiresVerification).toBe(true);
    expect(loginRes.body.data.verificationType).toBe("login");
    const loginCode = loginRes.body.data.verificationCode;
    expect(loginCode).toMatch(/^\d{6}$/);

    // Step 2: Verify login code
    const verifyLoginRes = await request(app)
      .post("/api/v1/auth/verify-login")
      .send({ email, code: loginCode });

    expect(verifyLoginRes.statusCode).toBe(200);
    expect(verifyLoginRes.body.data.token).toBeTruthy();
    expect(verifyLoginRes.body.data.user.email).toBe(email);
  });

  test("login with wrong code is rejected", async () => {
    const email = `wrong_login_${Date.now()}@example.com`;
    await registerUser("Wrong Code User", email);

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "password123" });

    const verifyLoginRes = await request(app)
      .post("/api/v1/auth/verify-login")
      .send({ email, code: "000000" });

    expect(verifyLoginRes.statusCode).toBe(400);
    expect(verifyLoginRes.body.success).toBe(false);
    expect(verifyLoginRes.body.message).toContain("Invalid verification code");
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

  test("change password updates credentials and allows login with new password", async () => {
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
    expect(newLogin.body.data.requiresVerification).toBe(true);

    const verifyNew = await request(app)
      .post("/api/v1/auth/verify-login")
      .send({ email, code: newLogin.body.data.verificationCode });
    expect(verifyNew.statusCode).toBe(200);
    expect(verifyNew.body.data.token).toBeTruthy();
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
