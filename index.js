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
// RENDER VARIABLES
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

// ==================================================
// OPENAI
// ==================================================

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

// ==================================================
// SETTINGS
// ==================================================

const TRIGGER = "kain po tayo team ryzza";

// ==================================================
// DELETE MESSAGE HELPER
// ==================================================

async function deleteMessage(message, reason) {
  console.log(
    `Deleting ${message.author.tag}: ${reason}`
  );

  try {
    await message.delete();
    console.log("Message deleted.");
  } catch (error) {
    console.error(
      "DELETE FAILED - Check Manage Messages permission:",
      error.message
    );
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

    // Prevent duplicate reminders after restart
    const existingReminder = messages.find(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title === "🍽️ Foodie Reminder"
    );

    if (existingReminder) {
      if (!existingReminder.pinned) {
        await existingReminder.pin().catch((error) => {
          console.error(
            "Could not pin existing reminder:",
            error.message
          );
        });
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

    console.log(
      "Foodie Reminder sent and pinned."
    );

  } catch (error) {
    console.error(
      "Reminder error:",
      error
    );
  }
}

// ==================================================
// AI FOOD IMAGE CHECK
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
                "Look at this image. Determine whether the main subject is clearly food or a food/drink item. Reply with ONLY YES or NO. People, animals, scenery, screenshots, memes, logos, documents, drawings, and ordinary objects are NOT food."
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

    console.log(
      `AI food check result: ${result}`
    );

    return result === "YES";

  } catch (error) {
    console.error(
      "AI food check failed:",
      error.message
    );

    // Fail closed:
    // If AI cannot check the picture,
    // do NOT allow it.
    return false;
  }
}

// ==================================================
// BOT READY
// ==================================================

client.once("ready", async () => {
  console.log(
    `Logged in as ${client.user.tag}`
  );

  console.log(
    `Food channel: ${FOOD_CHANNEL_ID}`
  );

  await sendFoodReminder();
});

// ==================================================
// MESSAGE HANDLER
// ==================================================

client.on("messageCreate", async (message) => {
  try {

    // ------------------------------------------------
    // ONLY FOOD CHANNEL
    // ------------------------------------------------

    if (message.channel.id !== FOOD_CHANNEL_ID) {
      return;
    }

    // ------------------------------------------------
    // NEVER DELETE BOT MESSAGES
    // ------------------------------------------------

    if (message.author.bot) {
      return;
    }

    // ------------------------------------------------
    // MESSAGE CONTENT
    // ------------------------------------------------

    const content = message.content
      .toLowerCase()
      .trim();

    const hasTrigger = content.includes(TRIGGER);

    // ------------------------------------------------
    // ATTACHMENTS
    // ------------------------------------------------

    const attachments = [...message.attachments.values()];

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

    // ------------------------------------------------
    // STICKER
    // ------------------------------------------------

    const hasSticker =
      message.stickers &&
      message.stickers.size > 0;

    // ------------------------------------------------
    // GIF
    // ------------------------------------------------

    const hasGif =
      attachments.some((attachment) => {
        const type = attachment.contentType || "";

        return (
          type === "image/gif" ||
          type === "video/mp4" &&
          attachment.name &&
          attachment.name.toLowerCase().endsWith(".gif")
        );
      });

    // ==================================================
    // RULE 1
    // NO TRIGGER
    // ==================================================
    //
    // This means:
    //
    // Emoji only       -> DELETE
    // GIF only         -> DELETE
    // Sticker only     -> DELETE
    // Image only       -> DELETE
    // Video only       -> DELETE
    // Normal chat      -> DELETE
    //
    // ==================================================

    if (!hasTrigger) {

      if (hasSticker) {
        await deleteMessage(
          message,
          "sticker without trigger"
        );
        return;
      }

      if (hasGif) {
        await deleteMessage(
          message,
          "GIF without trigger"
        );
        return;
      }

      if (video) {
        await deleteMessage(
          message,
          "video without trigger"
        );
        return;
      }

      if (image) {
        await deleteMessage(
          message,
          "image without trigger"
        );
        return;
      }

      await deleteMessage(
        message,
        "trigger missing"
      );

      return;
    }

    // ==================================================
    // RULE 2
    // TRIGGER + NO FOOD PICTURE
    // ==================================================

    if (!image) {

      // Trigger + video
      if (video) {
        await deleteMessage(
          message,
          "video is not supported by the food image check"
        );
        return;
      }

      // Trigger + GIF
      if (hasGif) {
        await deleteMessage(
          message,
          "GIF is not a food picture"
        );
        return;
      }

      // Trigger + sticker
      if (hasSticker) {
        await deleteMessage(
          message,
          "sticker is not a food picture"
        );
        return;
      }

      // Trigger with text only
      await deleteMessage(
        message,
        "trigger without food picture"
      );

      return;
    }

    // ==================================================
    // RULE 3
    // TRIGGER + IMAGE
    // ==================================================

    console.log(
      `Checking picture from ${message.author.tag}...`
    );

    const food = await isFoodImage(
      image.url
    );

    // ==================================================
    // RULE 4
    // IMAGE IS NOT FOOD
    // ==================================================

    if (!food) {

      await deleteMessage(
        message,
        "picture is NOT food"
      );

      return;
    }

    // ==================================================
    // RULE 5
    // FOOD APPROVED
    // ==================================================

    console.log(
      `Approved food picture from ${message.author.tag}`
    );

    // Delete original message
    await message.delete().catch((error) => {
      console.error(
        "Could not delete original message:",
        error.message
      );
    });

    // Repost ONLY the approved food picture
    await message.channel.send({
      files: [image.url]
    });

    console.log(
      "Approved food picture reposted."
    );

  } catch (error) {
    console.error(
      "Food channel error:",
      error
    );
  }
});

// ==================================================
// LOGIN
// ==================================================

client.login(DISCORD_TOKEN);
