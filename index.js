const express = require("express");
const OpenAI = require("openai");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

// ==========================
// RENDER HEALTH CHECK
// ==========================

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server running on port ${PORT}`);
});

// ==========================
// ENVIRONMENT VARIABLES
// ==========================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const FOOD_CHANNEL_ID = process.env.FOOD_CHANNEL_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!FOOD_CHANNEL_ID) {
  console.error("FOOD_CHANNEL_ID is missing!");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is missing!");
  process.exit(1);
}

// ==========================
// OPENAI
// ==========================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ==========================
// DISCORD CLIENT
// ==========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ==========================
// FOODIE REMINDER
// ==========================

async function sendFoodReminder() {
  try {
    const channel = await client.channels.fetch(FOOD_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      console.error("Food channel not found.");
      return;
    }

    const messages = await channel.messages.fetch({
      limit: 50
    });

    const existingReminder = messages.find(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title === "🍽️ Foodie Reminder"
    );

    if (existingReminder) {
      if (!existingReminder.pinned) {
        await existingReminder.pin().catch(() => {});
      }

      console.log("Foodie Reminder already exists.");
      return;
    }

    const reminderEmbed = new EmbedBuilder()
      .setTitle("🍽️ Foodie Reminder")
      .setDescription(
        "\u200B\n" +
        "**To post your food picture:**\n\n" +
        "Say **Kain Po Tayo Team Ryzza**\n" +
        "together with your food picture.\n\n" +
        "\u200B\n" +
        "🤖 **The Bot**\n\n" +
        "will check your picture and only allow food pictures."
      );

    const reminder = await channel.send({
      embeds: [reminderEmbed]
    });

    await reminder.pin();

    console.log("Foodie Reminder sent and pinned.");

  } catch (error) {
    console.error("Reminder error:", error);
  }
}

// ==========================
// BOT READY
// ==========================

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Food channel: ${FOOD_CHANNEL_ID}`);

  await sendFoodReminder();
});

// ==========================
// AI FOOD CHECK
// ==========================

async function isFoodImage(imageUrl) {
  try {
    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Is the main subject of this image clearly food or a drink? Reply with ONLY YES or NO. Do not count people, animals, scenery, screenshots, memes, text, logos, toys, or ordinary objects as food."
            },
            {
              type: "input_image",
              image_url: imageUrl
            }
          ]
        }
      ]
    });

    const result = response.output_text
      .trim()
      .toUpperCase();

    console.log(`AI food check: ${result}`);

    return result === "YES";

  } catch (error) {
    console.error("AI food check failed:", error);

    // Reject if AI cannot check it.
    return false;
  }
}

// ==========================
// STRICT FOOD CHANNEL
// ==========================

client.on("messageCreate", async (message) => {
  try {

    // Ignore channels other than the food channel
    if (message.channel.id !== FOOD_CHANNEL_ID) {
      return;
    }

    // IMPORTANT:
    // Never delete messages sent by this bot.
    if (message.author.bot) {
      return;
    }

    // Required phrase
    const trigger = "kain po tayo team ryzza";

    // Convert text to lowercase
    // so capitalization does not matter.
    const content = message.content
      .toLowerCase()
      .trim();

    // Find an attached image
    const image = message.attachments.find((attachment) => {
      return (
        attachment.contentType &&
        attachment.contentType.startsWith("image/")
      );
    });

    // ==========================
    // STRICT CHECK #1
    // NO TRIGGER = DELETE
    // ==========================

    if (!content.includes(trigger)) {

      console.log(
        `Deleting message from ${message.author.tag}: trigger missing`
      );

      await message.delete().catch((error) => {
        console.error(
          "DELETE FAILED - Check Manage Messages permission:",
          error.message
        );
      });

      return;
    }

    // ==========================
    // STRICT CHECK #2
    // TRIGGER BUT NO IMAGE
    // ==========================

    if (!image) {

      console.log(
        `Deleting message from ${message.author.tag}: no picture`
      );

      await message.delete().catch((error) => {
        console.error(
          "DELETE FAILED - Check Manage Messages permission:",
          error.message
        );
      });

      return;
    }

    // ==========================
    // AI CHECK
    // ==========================

    console.log(
      `Checking picture from ${message.author.tag}...`
    );

    const food = await isFoodImage(image.url);

    // ==========================
    // NOT FOOD = DELETE
    // ==========================

    if (!food) {

      console.log(
        `Deleting ${message.author.tag}: picture is NOT food`
      );

      await message.delete().catch((error) => {
        console.error(
          "DELETE FAILED - Check Manage Messages permission:",
          error.message
        );
      });

      return;
    }

    // ==========================
    // VALID FOOD
    // ==========================

    console.log(
      `Approved food picture from ${message.author.tag}`
    );

    // Delete original message containing
    // the trigger + picture.
    await message.delete().catch((error) => {
      console.error("Could not delete original:", error.message);
    });

    // Post ONLY the picture.
    await message.channel.send({
      files: [image.url]
    });

  } catch (error) {
    console.error("Food channel error:", error);
  }
});

// ==========================
// LOGIN
// ==========================

client.login(DISCORD_TOKEN);
