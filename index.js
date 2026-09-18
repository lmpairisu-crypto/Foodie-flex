
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server running on port ${PORT}`);
});

// ===============================
// CONFIG
// ===============================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Food channel ID
const FOOD_CHANNEL_ID = "1550189625954402314";

// Exact trigger
const TRIGGER = "kain po tayo team ryzza";

// AI model
const AI_MODEL = "gpt-5.6-luna";

// Maximum AI waiting time
const AI_TIMEOUT_MS = 7000;

// ===============================
// CHECK ENVIRONMENT VARIABLES
// ===============================

if (!DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is missing.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is missing.");
  process.exit(1);
}

console.log("DISCORD_TOKEN loaded.");
console.log("OPENAI_API_KEY loaded.");

// ===============================
// OPENAI
// ===============================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ===============================
// DISCORD CLIENT
// ===============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===============================
// FOOD EMOJIS
// ===============================

const FOOD_EMOJIS = [
  "🍞", "🥖", "🥐", "🍳", "🥚", "🧀", "🥨", "🫓",
  "🧈", "🥓", "🥩", "🥞", "🧇", "🍤", "🍗", "🍖",
  "🦴", "🍕", "🌭", "🍟", "🥙", "🧆", "🌮", "🌯",
  "🫔", "🥘", "🍝", "🍜", "🍲", "🍥", "🥯", "🥮",
  "🍣", "🍱", "🍛", "🍚", "🍘", "🥧", "🍦", "🍨",
  "🍧", "🍡", "🍢", "🥠", "🧁", "🍰", "🎂", "🍮",
  "🍭", "🍬", "🍫", "🥛", "🍯", "🍪", "🦪", "🥟",
  "🍩", "🍿", "☕", "🍵", "🧋", "🥤", "🧃"
];

function getFoodEmoji() {
  return FOOD_EMOJIS[
    Math.floor(Math.random() * FOOD_EMOJIS.length)
  ];
}

// ===============================
// HELPERS
// ===============================

function hasExactTrigger(content) {
  return content.trim().toLowerCase() === TRIGGER;
}

function isImage(attachment) {
  if (!attachment) return false;

  if (attachment.contentType?.startsWith("image/")) {
    return true;
  }

  const name = attachment.name?.toLowerCase() || "";

  return /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
}

async function safeDelete(message) {
  try {
    if (message.deletable) {
      await message.delete();
    }
  } catch (error) {
    console.error("Could not delete message:", error.message);
  }
}

async function downloadAttachment(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Attachment download failed: ${response.status}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

// ===============================
// AI FOOD CHECK
// ===============================

async function checkIfFood(imageUrl) {
  console.log("Starting AI food check...");

  const aiRequest = openai.responses.create({
    model: AI_MODEL,

    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Look carefully at this image.

Reply with ONLY:
FOOD
or
NOT_FOOD

IMPORTANT:
- Reply FOOD if ANY clearly visible food or drink is present anywhere in the image.
- A person being in the picture does NOT make it NOT_FOOD.
- A person holding, eating, preparing, serving, or standing near food still counts as FOOD.
- Food does not need to be the main subject.
- Drinks also count as FOOD.
- Multiple people are okay.
- Background objects are okay.
- Only reply NOT_FOOD when there is no clearly visible food or drink anywhere in the image.
            `.trim()
          },
          {
            type: "input_image",
            image_url: imageUrl
          }
        ]
      }
    ]
  });

  // IMPORTANT:
  // Timeout returns null instead of false.
  // This prevents a slow AI response from
  // incorrectly rejecting a valid food picture.

  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, AI_TIMEOUT_MS);
  });

  const result = await Promise.race([
    aiRequest,
    timeout
  ]);

  // AI took longer than 7 seconds.
  if (result === null) {
    console.log("AI check exceeded 7 seconds.");

    // Wait for the actual AI result instead of
    // incorrectly treating the timeout as NOT_FOOD.
    try {
      const finalResult = await aiRequest;

      const text =
        finalResult.output_text?.trim().toUpperCase() || "";

      console.log("AI final result:", text);

      return text === "FOOD";
    } catch (error) {
      console.error(
        "AI check failed after timeout:",
        error.message
      );

      return false;
    }
  }

  const text =
    result.output_text?.trim().toUpperCase() || "";

  console.log("AI result:", text);

  return text === "FOOD";
}

// ===============================
// FOOD REMINDER
// ===============================

async function ensureReminder(channel) {
  try {
    const messages = await channel.messages.fetch({
      limit: 100
    });

    const existingReminder = messages.find((message) => {
      if (message.author.id !== client.user.id) {
        return false;
      }

      return message.embeds.some(
        (embed) =>
          embed.title === "🍽️ Foodie Reminder"
      );
    });

    if (existingReminder) {
      if (!existingReminder.pinned) {
        await existingReminder.pin().catch(() => {});
      }

      console.log("Existing Foodie Reminder found.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🍽️ Foodie Reminder")
      .setDescription(
        "Post your food here with **Kain Po Tayo Team Ryzza** + a picture."
      );

    const reminder = await channel.send({
      embeds: [embed]
    });

    await reminder.pin().catch(() => {});

    console.log("Foodie Reminder created and pinned.");
  } catch (error) {
    console.error(
      "Could not create/find reminder:",
      error.message
    );
  }
}

// ===============================
// CLEANUP
// ===============================

async function cleanupChannel(channel) {
  let deleted = 0;

  const messages = await channel.messages.fetch({
    limit: 100
  });

  for (const message of messages.values()) {
    // Keep the pinned reminder
    if (
      message.pinned &&
      message.author.id === client.user.id &&
      message.embeds.some(
        (embed) =>
          embed.title === "🍽️ Foodie Reminder"
      )
    ) {
      continue;
    }

    try {
      await message.delete();
      deleted++;
    } catch (error) {
      console.error(
        "Cleanup delete failed:",
        error.message
      );
    }
  }

  return deleted;
}

async function cleanupUser(channel, userId) {
  let deleted = 0;

  const messages = await channel.messages.fetch({
    limit: 100
  });

  for (const message of messages.values()) {
    if (message.author.id !== userId) {
      continue;
    }

    // Keep the pinned reminder
    if (
      message.pinned &&
      message.author.id === client.user.id &&
      message.embeds.some(
        (embed) =>
          embed.title === "🍽️ Foodie Reminder"
      )
    ) {
      continue;
    }

    try {
      await message.delete();
      deleted++;
    } catch (error) {
      console.error(
        "User cleanup delete failed:",
        error.message
      );
    }
  }

  return deleted;
}

// ===============================
// BOT READY
// ===============================

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels
    .fetch(FOOD_CHANNEL_ID)
    .catch(() => null);

  if (!channel) {
    console.error(
      "Food channel could not be found."
    );
    return;
  }

  await ensureReminder(channel);
});

// ===============================
// MESSAGE HANDLER
// ===============================

client.on("messageCreate", async (message) => {
  try {
    // Ignore bots
    if (message.author.bot) return;

    // Only work inside the food channel
    if (message.channel.id !== FOOD_CHANNEL_ID) {
      return;
    }

    // ===========================
    // CLEANUP COMMAND
    // ===========================

    if (
      message.content
        .trim()
        .toLowerCase()
        .startsWith("!cleanup")
    ) {
      if (
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      ) {
        return;
      }

      const mentionedUser =
        message.mentions.users.first();

      await safeDelete(message);

      let deleted;

      if (mentionedUser) {
        deleted = await cleanupUser(
          message.channel,
          mentionedUser.id
        );
      } else {
        deleted = await cleanupChannel(
          message.channel
        );
      }

      const confirmation =
        await message.channel.send(
          `🧹 Cleanup complete. Deleted **${deleted}** message(s).`
        );

      setTimeout(() => {
        safeDelete(confirmation);
      }, 5000);

      return;
    }

    // ===========================
    // EXACT TRIGGER ONLY
    // ===========================

    if (!hasExactTrigger(message.content)) {
      return;
    }

    // ===========================
    // FIND IMAGE
    // ===========================

    const imageAttachment =
      message.attachments.find(isImage);

    if (!imageAttachment) {
      await safeDelete(message);

      try {
        await message.author.send(
          "❌ Please include a food or drink picture with **Kain Po Tayo Team Ryzza**."
        );
      } catch (error) {
        console.error(
          "Could not DM user:",
          error.message
        );
      }

      return;
    }

    // ===========================
    // DOWNLOAD FIRST
    // ===========================

    let imageBuffer;

    try {
      imageBuffer = await downloadAttachment(
        imageAttachment.url
      );
    } catch (error) {
      console.error(
        "Could not download image:",
        error.message
      );

      try {
        await message.author.send(
          "❌ I couldn't process that picture. Please try again."
        );
      } catch {}

      return;
    }

    // ===========================
    // PRIVATE CHECKING MESSAGE
    // ===========================

    try {
      await message.author.send(
        "🔎 Checking your food picture..."
      );
    } catch (error) {
      console.error(
        "Could not send checking DM:",
        error.message
      );
    }

    // Delete original submission
    await safeDelete(message);

    // ===========================
    // AI CHECK
    // ===========================

    const isFood = await checkIfFood(
      imageAttachment.url
    );

    // ===========================
    // REJECT
    // ===========================

    if (!isFood) {
      try {
        await message.author.send(
          "❌ No food or drink was confirmed in the picture, so it wasn't posted."
        );
      } catch (error) {
        console.error(
          "Could not send rejection DM:",
          error.message
        );
      }

      return;
    }

    // ===========================
    // APPROVED POST
    // ===========================

    const emoji = getFoodEmoji();

    const attachment =
      new AttachmentBuilder(imageBuffer, {
        name:
          imageAttachment.name ||
          "food-picture.jpg"
      });

    const post =
      `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
      `👤 <@${message.author.id}>`;

    await message.channel.send({
      content: post,
      files: [attachment],
      allowedMentions: {
        users: [message.author.id]
      }
    });

    console.log(
      `Food post approved for ${message.author.tag}`
    );
  } catch (error) {
    console.error(
      "Message handler error:",
      error
    );
  }
});

// ===============================
// LOGIN
// ===============================

client.login(DISCORD_TOKEN);
