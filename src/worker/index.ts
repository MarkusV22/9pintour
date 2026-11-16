// API-Einstieg 9pintour.at
import { Hono } from "hono";
import { HttpError, type AppEnv } from "./env";
import { sessionMiddleware, sameOriginWrites } from "./auth/session";
import auth from "./routes/auth";
import pub from "./routes/public";
import organizer from "./routes/organizer";
import entities from "./routes/entities";
import entityWrites from "./routes/entityWrites";
import functions from "./routes/functions";
import files from "./routes/files";
import dataCheck from "./routes/dataCheck";

export type { Env } from "./env";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", sameOriginWrites);
app.use("*", sessionMiddleware);
app.use("*", async (c, next) => {
  await next();
  if (!c.req.path.startsWith("/api/media/")) c.header("Cache-Control", "no-store");
});

app.route("/", auth);
app.route("/", pub);
app.route("/", organizer);
app.route("/", entityWrites);
app.route("/", functions);
app.route("/", files);
app.route("/", dataCheck);
app.route("/", entities);

app.get("/health", (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: "Nicht gefunden" }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Da ist etwas schiefgelaufen. Bitte versuch es nochmal." }, 500);
});

export default app;
