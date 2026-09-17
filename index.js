const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials
} = require("discord.js");

// =========================
// RENDER HEALTH CHECK
// =========================

const app = express();

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server running on port ${PORT}`);
});

// =========================
// ENVIRONMENT VARIABLES
// =========================

const TOKEN = process.env.DISCORD_TOKEN;
const FOOD_CHANNEL_ID = process.env.FOOD_CHANNEL_ID;

if (!TOKEN) {
  console.error("ERROR: DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!FOOD_CHANNEL_ID) {
  console.error("ERROR: FOOD_CHANNEL_ID is missing!");
  process.exit(1);
}

// =========================
// DISCORD CLIENT
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// =========================
// BOT READY
// =========================

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Food channel: ${FOOD_CHANNEL_ID}`);
});

// =========================
// FOODIE TRIGGER
// =========================

client.on("messageCreate", async (message) => {
  try {
    // Ignore bots
    if (message.author.bot) return;

    // Only work in the selected food channel
    if (message.channel.id !== FOOD_CHANNEL_ID) return;

    // Required trigger phrase
    const trigger = "kain po tayo team ryzza";

    const content = message.content
      .trim()
      .toLowerCase();

    // Check whether the message contains an image
    const image = message.attachments.find((attachment) => {
      return attachment.contentType?.startsWith("image/");
    });

    // =========================
    // PICTURE WITHOUT TRIGGER
    // =========================

    if (image && !content.includes(trigger)) {
      await message.delete().catch(() => {});

      return;
    }

    // =========================
    // TRIGGER WITHOUT PICTURE
    // =========================

    if (content.includes(trigger) && !image) {
      await message.delete().catch(() => {});

      return;
    }

    // =========================
    // VALID FOOD POST
    // =========================

    if (content.includes(trigger) && image) {
      const imageURL = image.url;

      // Delete the member's original message
      await message.delete().catch(() => {});

      // Send ONLY the picture
      await message.channel.send({
        files: [imageURL]
      });

      console.log(
        `${message.author.tag} posted a foodie picture.`
      );
    }

  } catch (error) {
    console.error("Foodie bot error:", error);
  }
});

// =========================
// LOGIN
// =========================

client.login(TOKEN);
