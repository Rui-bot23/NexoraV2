/**
 * Nexora API Server (Fastify)
 * POST /api/validate   — Validate a license key from your software
 * GET  /api/license/:key — Get license info (admin token required)
 * GET  /api/stats       — Public stats endpoint
 */

const Fastify = require("fastify");
const { License, Blacklist, Product } = require("../models");
const { getConfig } = require("./config");

async function startApiServer(client, config) {
  const app = Fastify({ logger: false });

  // CORS
  await app.register(require("@fastify/cors"), { origin: "*" });

  // ── POST /api/validate ──────────────────────────────────────────────────────
  app.post("/api/validate", async (req, reply) => {
    const { key, ip, hwid, product } = req.body || {};

    if (!key) return reply.code(400).send({ status: "error", message: "Missing license key" });

    const licKey = key.trim().toUpperCase();
    const license = await License.findOne({ licenseKey: licKey });

    if (!license) {
      return reply.send({ status: "invalid", message: "License key not found" });
    }

    // Suspended
    if (license.suspended) {
      license.attempts++;
      await license.save();
      return reply.send({ status: "suspended", message: "This license has been suspended" });
    }

    // Expired
    if (!license.permanent && license.expiresAt > 0 && license.expiresAt < Date.now()) {
      return reply.send({ status: "expired", message: "This license has expired" });
    }

    // Product check
    if (product && license.productName.toLowerCase() !== product.toLowerCase()) {
      return reply.send({ status: "invalid", message: "License not valid for this product" });
    }

    // IP Blacklist check
    if (ip) {
      const ipBl = await Blacklist.findOne({ type: "ip", value: ip });
      if (ipBl) return reply.send({ status: "blacklisted", message: "Your IP is blacklisted" });
    }

    // HWID Blacklist check
    if (hwid) {
      const hwidBl = await Blacklist.findOne({ type: "hwid", value: hwid });
      if (hwidBl) return reply.send({ status: "blacklisted", message: "Your hardware ID is blacklisted" });
    }

    // IP binding
    if (ip) {
      if (!license.ipArray.includes(ip)) {
        if (license.ipArray.length >= license.maxIp) {
          license.attempts++;
          await license.save();
          return reply.send({ status: "ip_limit", message: `Max IP limit (${license.maxIp}) reached` });
        }
        license.ipArray.push(ip);
      }
      license.latestIp = ip;
    }

    // HWID binding
    if (hwid) {
      if (!license.hwidArray.includes(hwid)) {
        if (license.hwidArray.length >= license.maxHwId) {
          license.attempts++;
          await license.save();
          return reply.send({ status: "hwid_limit", message: `Max HWID limit (${license.maxHwId}) reached` });
        }
        license.hwidArray.push(hwid);
      }
      license.latestHwId = hwid;
    }

    // Mark used
    if (!license.isUsed) {
      license.isUsed = true;
      license.usedAt = Date.now();
    }

    license.totalRequests++;
    license.attempts = 0;
    await license.save();

    const expiryInfo = license.permanent || license.expiresAt === 0
      ? { permanent: true, expiresAt: null }
      : { permanent: false, expiresAt: license.expiresAt };

    return reply.send({
      status: "valid",
      message: "License is valid",
      data: {
        licenseKey:  license.licenseKey,
        productName: license.productName,
        description: license.description,
        ...expiryInfo,
      },
    });
  });

  // ── GET /api/license/:key ───────────────────────────────────────────────────
  app.get("/api/license/:key", async (req, reply) => {
    const { key } = req.params;
    const licKey = key.trim().toUpperCase();
    const license = await License.findOne({ licenseKey: licKey });

    if (!license) return reply.code(404).send({ status: "error", message: "License not found" });

    return reply.send({
      status: "ok",
      data: {
        licenseKey:    license.licenseKey,
        productName:   license.productName,
        description:   license.description,
        permanent:     license.permanent,
        expiresAt:     license.expiresAt,
        suspended:     license.suspended,
        isUsed:        license.isUsed,
        totalRequests: license.totalRequests,
        ipCount:       license.ipArray.length,
        hwidCount:     license.hwidArray.length,
        createdAt:     license.createdAt,
      },
    });
  });

  // ── GET /api/stats ──────────────────────────────────────────────────────────
  app.get("/api/stats", async (req, reply) => {
    const [totalLicenses, activeLicenses, products] = await Promise.all([
      License.countDocuments(),
      License.countDocuments({ suspended: false, isUsed: true }),
      Product.countDocuments(),
    ]);
    return reply.send({ status: "ok", totalLicenses, activeLicenses, products });
  });

  // ── GET /api/health ─────────────────────────────────────────────────────────
  app.get("/api/health", async (req, reply) => {
    return reply.send({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
  });

  const port = process.env.API_PORT || config.api?.port || 8888;
  const host = config.api?.host || "0.0.0.0";

  try {
    await app.listen({ port, host });
    const chalk = require("chalk");
    console.log(chalk.green(`[API] Server listening on ${host}:${port}`));
  } catch (err) {
    console.error("[API] Failed to start:", err.message);
  }
}

module.exports = { startApiServer };
