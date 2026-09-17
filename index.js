const express = require("express");
const OpenAI = require("openai");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

// ==================================================
// HEALTH SERVER
// ==================================================

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server running on port ${PORT}`);
});

// ==================================================
// VARIABLES
// ==================================================

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

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ==================================================
// DISCORD CLIENT
// ==================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TRIGGER = "kain po tayo team ryzza";

// ==================================================
// DELETE FUNCTION
// ==================================================

async function deleteMessage(message, reason) {
  console.log(
    `Deleting ${message.author.tag}: ${reason}`
  );

  try {
    await message.delete();
    console.log("Message deleted successfully.");
  } catch (error) {
    console.error(
      "MESSAGE DELETE FAILED:",
      error.message
    );
  }
}

// ==================================================
// FOOD AI CHECK
// ==================================================

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
                "Is the main subject of this image clearly food or a food/drink item? Reply ONLY YES or NO. People, animals, scenery, screenshots, memes, logos, documents, and ordinary objects are NOT food."
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

    console.log(`AI RESULT: ${result}`);

    return result === "YES";

  } catch (error) {
    console.error(
      "AI CHECK FAILED:",
      error.message
    );

    return false;
  }
}

// ==================================================
// FOODIE REMINDER
// ==================================================

async function sendFoodReminder() {
  try {
    const channel = await client.channels.fetch(
      FOOD_CHANNEL_ID
    );

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

    const embed = new EmbedBuilder()
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
      embeds: [embed]
    });

    await reminder.pin();

    console.log("Foodie Reminder sent and pinned.");

  } catch (error) {
    console.error(
      "Reminder error:",
      error.message
    );
  }
}

// ==================================================
// BOT READY
// ==================================================

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Watching food channel: ${FOOD_CHANNEL_ID}`);

  await sendFoodReminder();
});

// ==================================================
// MESSAGE HANDLER
// ==================================================

client.on("messageCreate", async (message) => {

  // VERY IMPORTANT:
  // Log EVERY message received by the bot.
  console.log(
    `[MESSAGE RECEIVED] Channel=${message.channel.id} User=${message.author.tag}`
  );

  try {

    // Ignore messages outside food channel
    if (message.channel.id !== FOOD_CHANNEL_ID) {
      console.log("Ignored: different channel.");
      return;
    }

    // Never process bot messages
    if (message.author.bot) {
      console.log("Ignored: bot message.");
      return;
    }

    const content = message.content
      .toLowerCase()
      .trim();

    const hasTrigger = content.includes(TRIGGER);

    const attachments = [
      ...message.attachments.values()
    ];

    const image = attachments.find(
      (attachment) =>
        attachment.contentType &&
        attachment.contentType.startsWith("image/")
    );

    const video = attachments.find(
      (attachment) =>
        attachment.contentType &&
        attachment.contentType.startsWith("video/")
    );

    const hasSticker =
      message.stickers &&
      message.stickers.size > 0;

    console.log(
      `[CHECK] trigger=${hasTrigger} image=${!!image} video=${!!video} sticker=${hasSticker}`
    );

    // ==================================================
    // NO TRIGGER = DELETE EVERYTHING
    // ==================================================

    if (!hasTrigger) {
      await deleteMessage(
        message,
        "trigger missing"
      );
      return;
    }

    // ==================================================
    // TRIGGER WITHOUT IMAGE = DELETE
    // ==================================================

    if (!image) {
      await deleteMessage(
        message,
        "trigger found but no image"
      );
      return;
    }

    // ==================================================
    // TRIGGER + IMAGE = AI CHECK
    // ==================================================

    console.log(
      `Checking food picture from ${message.author.tag}...`
    );

    const food = await isFoodImage(
      image.url
    );

    // ==================================================
    // NOT FOOD = DELETE
    // ==================================================

    if (!food) {
      await deleteMessage(
        message,
        "image is not food"
      );
      return;
    }

    // ==================================================
    // FOOD = DELETE ORIGINAL + REPOST IMAGE
    // ==================================================

    console.log(
      `Food approved from ${message.author.tag}`
    );

    await message.delete().catch((error) => {
      console.error(
        "Original message delete failed:",
        error.message
      );
    });

    await message.channel.send({
      files: [image.url]
    });

    console.log(
      "Approved food image reposted."
    );

  } catch (error) {
    console.error(
      "MESSAGE HANDLER ERROR:",
      error
    );
  }
});

// ==================================================
// LOGIN
// ==================================================

client.login(DISCORD_TOKEN);
