const express = require("express");
const OpenAI = require("openai");
const {
  Client,
  GatewayIntentBits
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
// FOOD CHANNEL REMINDER
// ==========================

async function sendFoodReminder() {
  try {
    const channel = await client.channels.fetch(FOOD_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      console.error("Food channel could not be found.");
      return;
    }

    await channel.send({
      content:
        "🍽️ **Foodie Reminder**\n" +
        "To post your food picture, you need to say **Kain Po Tayo Team Ryzza** together with your picture.\n" +
        "🤖 The bot will check the picture and only allow food pictures."
    });

    console.log("Foodie reminder sent.");
  } catch (error) {
    console.error("Could not send food reminder:", error);
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
                "Look at this image. Is the main subject clearly food or a food/drink item? Reply with ONLY YES or NO. Do not consider text, logos, memes, people, animals, scenery, or ordinary objects to be food."
            },
            {
              type: "input_image",
              image_url: imageUrl
            }
          ]
        }
      ]
    });

    const result = response.output_text.trim().toUpperCase();

    console.log(`AI food check: ${result}`);

    return result === "YES";
  } catch (error) {
    console.error("AI food check failed:", error);

    // If the AI check fails,
    // do not allow the picture.
    return false;
  }
}

// ==========================
// FOOD CHANNEL MODERATION
// ==========================

client.on("messageCreate", async (message) => {
  try {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only moderate the food channel
    if (message.channel.id !== FOOD_CHANNEL_ID) return;

    // Required trigger phrase
    const trigger = "kain po tayo team ryzza";

    // Emojis are allowed.
    const content = message.content.toLowerCase();

    // Find image attachment
    const image = message.attachments.find((attachment) => {
      return attachment.contentType?.startsWith("image/");
    });

    // ==========================
    // NO TRIGGER
    // ==========================

    if (!content.includes(trigger)) {
      await message.delete().catch(() => {});

      console.log(
        `Deleted ${message.author.tag}: missing trigger`
      );

      return;
    }

    // ==========================
    // NO PICTURE
    // ==========================

    if (!image) {
      await message.delete().catch(() => {});

      console.log(
        `Deleted ${message.author.tag}: no picture`
      );

      return;
    }

    // ==========================
    // AI FOOD CHECK
    // ==========================

    const food = await isFoodImage(image.url);

    // ==========================
    // NOT FOOD
    // ==========================

    if (!food) {
      await message.delete().catch(() => {});

      console.log(
        `Deleted ${message.author.tag}: not food`
      );

      return;
    }

    // ==========================
    // APPROVED FOOD
    // ==========================

    // Delete original message
    await message.delete().catch(() => {});

    // Post ONLY the picture
    await message.channel.send({
      files: [image.url]
    });

    console.log(
      `Approved food picture from ${message.author.tag}`
    );

  } catch (error) {
    console.error("Food bot error:", error);
  }
});

// ==========================
// LOGIN
// ==========================

client.login(DISCORD_TOKEN);
