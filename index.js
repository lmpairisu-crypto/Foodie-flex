
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  AttachmentBuilder,
  EmbedBuilder
} = require("discord.js");
const OpenAI = require("openai");

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
// CONFIG
// ==================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const FOOD_CHANNEL_ID = "1550189625954402314";

const TRIGGER = "kain po tayo team ryzza";

const AI_MODEL = "gpt-5.6-luna";

// 7 seconds gives the AI enough time to inspect the image.
const AI_TIMEOUT_MS = 7000;

// ==================================================
// ENVIRONMENT CHECK
// ==================================================

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
// FOOD EMOJIS
// ==================================================

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

// ==================================================
// HELPERS
// ==================================================

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

function isVideo(attachment) {
  if (!attachment) return false;

  if (attachment.contentType?.startsWith("video/")) {
    return true;
  }

  const name = attachment.name?.toLowerCase() || "";

  return /\.(mp4|mov|webm|m4v)$/i.test(name);
}

function hasMedia(message) {
  return message.attachments.some(
    (attachment) =>
      isImage(attachment) || isVideo(attachment)
  );
}

function getImageAttachment(message) {
  return message.attachments.find(isImage) || null;
}

async function safeDelete(message) {
  try {
    if (message.deletable) {
      await message.delete();
    }
  } catch (error) {
    console.error(
      "Could not delete message:",
      error.message
    );
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

async function sendPrivateDM(user, content) {
  try {
    await user.send(content);
  } catch (error) {
    console.error(
      "Could not send private DM:",
      error.message
    );
  }
}

// ==================================================
// AI FOOD CHECK
// ==================================================

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
- A restaurant, table, kitchen, or other surroundings do not make it NOT_FOOD.
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

  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, AI_TIMEOUT_MS);
  });

  const result = await Promise.race([
    aiRequest,
    timeout
  ]);

  // IMPORTANT:
  // A timeout is NOT considered NOT_FOOD.
  // We wait for the actual AI result.

  if (result === null) {
    console.log(
      "AI has taken longer than 7 seconds. Waiting for result..."
    );

    try {
      const finalResult = await aiRequest;

      const text =
        finalResult.output_text
          ?.trim()
          .toUpperCase() || "";

      console.log("AI final result:", text);

      return text === "FOOD";
    } catch (error) {
      console.error(
        "AI check failed:",
        error.message
      );

      return false;
    }
  }

  const text =
    result.output_text
      ?.trim()
      .toUpperCase() || "";

  console.log("AI result:", text);

  return text === "FOOD";
}

// ==================================================
// FOODIE REMINDER
// ==================================================

async function ensureReminder(channel) {
  try {
    const messages = await channel.messages.fetch({
      limit: 100
    });

    const existingReminder = messages.find(
      (message) => {
        if (message.author.id !== client.user.id) {
          return false;
        }

        return message.embeds.some(
          (embed) =>
            embed.title === "🍽️ Foodie Reminder"
        );
      }
    );

    if (existingReminder) {
      if (!existingReminder.pinned) {
        await existingReminder.pin().catch(() => {});
      }

      console.log(
        "Existing Foodie Reminder found."
      );

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

    console.log(
      "Foodie Reminder created and pinned."
    );
  } catch (error) {
    console.error(
      "Could not create/find reminder:",
      error.message
    );
  }
}

// ==================================================
// CLEANUP
// ==================================================

async function cleanupChannel(channel) {
  let deleted = 0;

  const messages = await channel.messages.fetch({
    limit: 100
  });

  for (const message of messages.values()) {
    // Never delete the pinned Foodie Reminder.
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

    // Never delete the pinned Foodie Reminder.
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

// ==================================================
// BOT READY
// ==================================================

client.once("ready", async () => {
  console.log(
    `Logged in as ${client.user.tag}`
  );

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

// ==================================================
// MESSAGE HANDLER
// ==================================================

client.on("messageCreate", async (message) => {
  try {
    // Ignore bots.
    if (message.author.bot) return;

    // Only process the Foodie channel.
    if (message.channel.id !== FOOD_CHANNEL_ID) {
      return;
    }

    // ==================================================
    // CLEANUP COMMAND
    // ==================================================

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

    // ==================================================
    // EXACT TRIGGER
    // ==================================================

    const hasTrigger =
      hasExactTrigger(message.content);

    // Anything without the exact trigger is untouched.
    //
    // This means:
    // - normal chat = untouched
    // - emoji = untouched
    // - server emoji = untouched
    // - Nitro emoji = untouched
    // - picture only = untouched
    // - video only = untouched

    if (!hasTrigger) {
      return;
    }

    // ==================================================
    // TRIGGER WITHOUT MEDIA
    // ==================================================

    if (!hasMedia(message)) {
      await safeDelete(message);

      await sendPrivateDM(
        message.author,
        "❌ Please include a food or drink picture/video with **Kain Po Tayo Team Ryzza**."
      );

      return;
    }

    // ==================================================
    // GET IMAGE
    // ==================================================

    const imageAttachment =
      getImageAttachment(message);

    // Current AI food checking uses images.
    // Videos are detected, but are not sent to the
    // image AI because the Responses image input expects
    // an image rather than a raw video attachment.

    if (!imageAttachment) {
      await safeDelete(message);

      await sendPrivateDM(
        message.author,
        "❌ Please send a picture with **Kain Po Tayo Team Ryzza** so I can check the food."
      );

      return;
    }

    // ==================================================
    // DOWNLOAD BEFORE DELETE
    // ==================================================

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

      await sendPrivateDM(
        message.author,
        "❌ I couldn't process that picture. Please try again."
      );

      return;
    }

    // ==================================================
    // PRIVATE CHECKING MESSAGE
    // ==================================================

    await sendPrivateDM(
      message.author,
      "🔎 Checking your food picture..."
    );

    // Delete original submission.
    await safeDelete(message);

    // ==================================================
    // AI CHECK
    // ==================================================

    const isFood = await checkIfFood(
      imageAttachment.url
    );

    // ==================================================
    // REJECT
    // ==================================================

    if (!isFood) {
      await sendPrivateDM(
        message.author,
        "❌ No food or drink was confirmed in the picture, so it wasn't posted."
      );

      return;
    }

    // ==================================================
    // APPROVED PUBLIC POST
    // ==================================================

    const emoji = getFoodEmoji();

    const attachment =
      new AttachmentBuilder(imageBuffer, {
        name:
          imageAttachment.name ||
          "food-picture.jpg"
      });

    // The public channel only receives:
    //
    // Kain Po Tayo Team Ryzza + emoji
    // 👤 @Sender
    // Picture
    //
    // No extra AI text.

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

// ==================================================
// LOGIN
// ==================================================

client.login(DISCORD_TOKEN);
