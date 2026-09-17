
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
// FOODIE REMINDER EMBED
// ==========================

async function sendFoodReminder() {
  try {
    const channel = await client.channels.fetch(FOOD_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      console.error("Food channel not found.");
      return;
    }

    // Prevent duplicate reminders
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
      console.log("Foodie Reminder already exists.");

      // Make sure it is pinned
      if (!existingReminder.pinned) {
        await existingReminder.pin().catch(() => {});
      }

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

    // Pin the reminder
    await reminder.pin();

    console.log("Foodie Reminder embed sent and pinned.");

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
                "Look at this image. Is the main subject clearly food or a food/drink item? Reply with ONLY YES or NO. People, animals, scenery, memes, screenshots, logos, and ordinary objects are NOT food."
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

    // If AI cannot check the picture,
    // reject it.
    return false;
  }
}

// ==========================
// FOOD CHANNEL MODERATION
// ==========================

client.on("messageCreate", async (message) => {
  try {
    // Only moderate the food channel
    if (message.channel.id !== FOOD_CHANNEL_ID) return;

    // Never delete bot messages
    if (message.author.bot) return;

    // ==========================
    // REQUIRED TRIGGER
    // ==========================

    const trigger = "kain po tayo team ryzza";

    // Emojis are allowed.
    const content = message.content.toLowerCase();

    // ==========================
    // FIND IMAGE
    // ==========================

    const image = message.attachments.find((attachment) => {
      return attachment.contentType?.startsWith("image/");
    });

    // ==========================
    // NO TRIGGER
    // ==========================

    if (!content.includes(trigger)) {
      await message.delete().catch((error) => {
        console.error("Could not delete message:", error);
      });

      console.log(
        `Deleted ${message.author.tag}: missing trigger`
      );

      return;
    }

    // ==========================
    // NO PICTURE
    // ==========================

    if (!image) {
      await message.delete().catch((error) => {
        console.error("Could not delete message:", error);
      });

      console.log(
        `Deleted ${message.author.tag}: trigger without picture`
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
      await message.delete().catch((error) => {
        console.error("Could not delete message:", error);
      });

      console.log(
        `Deleted ${message.author.tag}: picture is not food`
      );

      return;
    }

    // ==========================
    // APPROVED FOOD
    // ==========================

    // Delete the original message
    await message.delete().catch(() => {});

    // Post ONLY the food picture
    await message.channel.send({
      files: [image.url]
    });

    console.log(
      `Approved food picture from ${message.author.tag}`
    );

  } catch (error) {
    console.error("Message handler error:", error);
  }
});

// ==========================
// LOGIN
// ==========================

client.login(DISCORD_TOKEN);
