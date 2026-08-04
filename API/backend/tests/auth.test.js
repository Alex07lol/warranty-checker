const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

describe("Auth API", () => {
  beforeAll(async () => {
    await startDb();
  });

  afterAll(async () => {
    await stopDb();
  });

  test("register returns token and user profile", async () => {
    const { response } = await registerUser(
      "Test User",
      `user_${Date.now()}@example.com`
    );
    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.token).toBeTruthy();
    expect(response.body.data.user.email).toContain("user_");
    expect(response.body.data.user.name).toBe("Test User");
  });

  test("register rejects duplicate email", async () => {
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
