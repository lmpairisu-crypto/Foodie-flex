require("dotenv").config();

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

const OpenAI = require("openai");

// ======================================================
// RAVENHOST HEALTH SERVER
// ======================================================

const app = express();

const PORT = Number(process.env.PORT) || 10000;

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.get("/health", (req, res) => {
  res.send("OK");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server listening on port ${PORT}`);
});

// ======================================================
// ENVIRONMENT
// ======================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN environment variable.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY environment variable.");
  process.exit(1);
}

// ======================================================
// OPENAI
// ======================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ======================================================
// DISCORD CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ======================================================
// SETTINGS
// ======================================================

const FOOD_CHANNEL_ID = "1550189625954402314";

const PARTY_THREAD_ID = "1550393236365910067";

const FOOD_TRIGGER = "Kain Po Tayo Team Ryzza";

const AI_MODEL = "gpt-5.6-luna";

const AI_TIMEOUT_MS = 15000;

const BOT_POST_DELAY_MS = 30000;

const PARTY_THREAD_NAME = "💬 Kain Po Tayo — Party Chat";

// ======================================================
// FOOD EMOJIS
// ======================================================

const FOOD_EMOJI_LIST = [
  "🍞",
  "🥖",
  "🥐",
  "🍳",
  "🥚",
  "🧀",
  "🥨",
  "🫓",
  "🧈",
  "🥓",
  "🥩",
  "🥞",
  "🧇",
  "🍔",
  "🍤",
  "🍗",
  "🍖",
  "🍕",
  "🌭",
  "🍟",
  "🥙",
  "🧆",
  "🌮",
  "🌯",
  "🫔",
  "🥘",
  "🍝",
  "🍜",
  "🍲",
  "🍥",
  "🥯",
  "🥮",
  "🍣",
  "🍱",
  "🍛",
  "🍚",
  "🍘",
  "🥧",
  "🍦",
  "🍨",
  "🍧",
  "🍡",
  "🍢",
  "🥠",
  "🧁",
  "🍰",
  "🎂",
  "🍮",
  "🍭",
  "🍬",
  "🍫",
  "🥛",
  "🍯",
  "🍪",
  "🦪",
  "🥟",
  "🍩",
  "🍿",
  "☕",
  "🍵",
  "🧋",
  "🥤",
  "🧃",
  "🍽️",
];

// ======================================================
// HELPERS
// ======================================================

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTrigger(text) {
  return String(text || "").trim().toLowerCase();
}

function isExactTrigger(text) {
  return normalizeTrigger(text) === normalizeTrigger(FOOD_TRIGGER);
}

function getAttachmentExtension(attachment) {
  const name = attachment.name || "";

  const ext = path.extname(name).toLowerCase();

  if (ext) {
    return ext;
  }

  const contentType = attachment.contentType || "";

  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("jpeg")) return ".jpg";
  if (contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("mp4")) return ".mp4";
  if (contentType.includes("webm")) return ".webm";
  if (contentType.includes("mov")) return ".mov";

  return "";
}

function isImageAttachment(attachment) {
  const contentType = String(attachment.contentType || "").toLowerCase();
  const name = String(attachment.name || "").toLowerCase();

  return (
    contentType.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(name)
  );
}

function isVideoAttachment(attachment) {
  const contentType = String(attachment.contentType || "").toLowerCase();
  const name = String(attachment.name || "").toLowerCase();

  return (
    contentType.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(name)
  );
}

async function downloadAttachment(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Attachment download failed: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

// ======================================================
// PRIVATE DM
// ======================================================

async function sendPrivateDM(user, text) {
  try {
    await user.send(text);
    return true;
  } catch (error) {
    console.error(
      `Unable to DM ${user.tag || user.id}:`,
      error.message
    );

    return false;
  }
}

// ======================================================
// AI FOOD CHECK
// ======================================================

async function checkFoodWithAI(imageBuffers) {
  if (!Array.isArray(imageBuffers)) {
    imageBuffers = [imageBuffers];
  }

  if (!imageBuffers.length) {
    throw new Error("No images supplied to AI.");
  }

  const content = [
    {
      type: "input_text",
      text: `
You are the food verification system for a Discord food-submission channel.

Determine whether the supplied image or video frame contains clearly recognizable
FOOD OR A DRINK intended for eating or drinking.

ACCEPT:
- Food on a plate
- Food on a table
- Food in a bowl
- Food being held by a person
- A person eating food
- A person/selfie with food visible anywhere
- Restaurant food
- Homemade food
- Desserts
- Snacks
- Fast food
- Fruits and vegetables
- Drinks/beverages
- Food visible in the background
- Multiple foods

IMPORTANT:
A person, selfie, face, pet, table, restaurant, kitchen, plate, utensils,
or background DOES NOT invalidate the submission if recognizable food or drink
is actually visible.

REJECT:
- No recognizable food or drink
- Selfie/person with no food
- Random objects
- Landscape with no food
- Text-only image
- Meme with no actual food/drink
- Empty plate
- Packaging or food containers ONLY when the actual food/drink is not visible
- An object that merely resembles food but is not reasonably recognizable as food/drink

For video frames, judge the collection of frames together. If food is clearly
visible in at least one useful frame, accept the submission.

Choose exactly ONE emoji from this allowed list:

${FOOD_EMOJI_LIST.join(" ")}

Return ONLY the structured result required by the API.
      `.trim(),
    },
  ];

  for (const buffer of imageBuffers) {
    const base64 = buffer.toString("base64");

    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${base64}`,
      detail: "auto",
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, AI_TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: AI_MODEL,

        reasoning: {
          effort: "low",
        },

        input: [
          {
            role: "system",
            content:
              "You are a strict but practical food verification classifier.",
          },
          {
            role: "user",
            content,
          },
        ],

        text: {
          format: {
            type: "json_schema",
            name: "food_verification",
            strict: true,
            schema: {
              type: "object",
              properties: {
                food: {
                  type: "boolean",
                },
                emoji: {
                  type: ["string", "null"],
                  enum: [...FOOD_EMOJI_LIST, null],
                },
              },
              required: ["food", "emoji"],
              additionalProperties: false,
            },
          },
        },

        max_output_tokens: 100,
      },
      {
        signal: controller.signal,
      }
    );

    const result = JSON.parse(response.output_text);

    if (result.food !== true) {
      return {
        food: false,
        emoji: null,
      };
    }

    if (
      typeof result.emoji !== "string" ||
      !FOOD_EMOJI_LIST.includes(result.emoji)
    ) {
      return {
        food: true,
        emoji: "🍽️",
      };
    }

    return {
      food: true,
      emoji: result.emoji,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ======================================================
// FFMPEG
// ======================================================

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    ffmpeg.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            "ffmpeg is not installed or is not available in the RavenHost PATH."
          )
        );
        return;
      }

      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve({
          stdout,
          stderr,
        });
      } else {
        reject(
          new Error(
            `ffmpeg exited with code ${code}\n${stderr.slice(-3000)}`
          )
        );
      }
    });
  });
}

// ======================================================
// EXTRACT VIDEO FRAMES
// ======================================================

async function extractVideoFrames(videoBuffer, originalExtension) {
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "foodie-")
  );

  const inputPath = path.join(
    tempDir,
    `input${originalExtension || ".mp4"}`
  );

  const outputPattern = path.join(
    tempDir,
    "frame-%02d.jpg"
  );

  try {
    await fs.promises.writeFile(inputPath, videoBuffer);

    /*
     * Extract up to 6 representative frames.
     *
     * fps=1/2 means approximately one frame every 2 seconds.
     * The select filter then limits the number of generated frames.
     */
    await runFFmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-vf",
      "fps=1/2,scale=1280:-2",
      "-frames:v",
      "6",
      "-q:v",
      "4",
      outputPattern,
    ]);

    const files = await fs.promises.readdir(tempDir);

    const frameFiles = files
      .filter((file) => /^frame-\d+\.jpg$/i.test(file))
      .sort();

    if (!frameFiles.length) {
      throw new Error("ffmpeg did not produce any video frames.");
    }

    const frames = [];

    for (const file of frameFiles) {
      const framePath = path.join(tempDir, file);
      frames.push(await fs.promises.readFile(framePath));
    }

    return frames;
  } finally {
    try {
      await fs.promises.rm(tempDir, {
        recursive: true,
        force: true,
      });
    } catch (error) {
      console.error(
        "Temporary video cleanup failed:",
        error.message
      );
    }
  }
}

// ======================================================
// FOOD QUEUE
// ======================================================

const foodQueue = [];
let processingFood = false;

function addToFoodQueue(job) {
  foodQueue.push(job);
  processFoodQueue().catch((error) => {
    console.error("Food queue error:", error);
  });
}

async function processFoodQueue() {
  if (processingFood) {
    return;
  }

  processingFood = true;

  try {
    while (foodQueue.length > 0) {
      const job = foodQueue.shift();

      try {
        await processFoodSubmission(job);
      } catch (error) {
        console.error(
          "Food submission processing error:",
          error
        );

        await sendPrivateDM(
          job.user,
          "❌ Something went wrong while checking your food submission. Please try again."
        );
      }
    }
  } finally {
    processingFood = false;
  }
}

// ======================================================
// PROCESS FOOD SUBMISSION
// ======================================================

async function processFoodSubmission({
  user,
  mediaBuffer,
  mediaType,
  fileName,
  contentType,
}) {
  let aiResult;

  try {
    if (mediaType === "image") {
      aiResult = await checkFoodWithAI([mediaBuffer]);
    } else if (mediaType === "video") {
      console.log(
        `Extracting frames from video submitted by ${user.tag || user.id}...`
      );

      const extension = path.extname(fileName || "").toLowerCase() || ".mp4";

      const frames = await extractVideoFrames(
        mediaBuffer,
        extension
      );

      aiResult = await checkFoodWithAI(frames);
    } else {
      throw new Error("Unknown media type.");
    }
  } catch (error) {
    console.error("AI food check failed:", error);

    await sendPrivateDM(
      user,
      "⚠️ I couldn't finish checking your submission right now. Please send it again in the Foodie channel using **Kain Po Tayo Team Ryzza** + your food photo/video."
    );

    return;
  }

  // ====================================================
  // REJECTED
  // ====================================================

  if (!aiResult.food) {
    await sendPrivateDM(
      user,
      "❌ Your submission was not posted because I couldn't clearly recognize food or a drink in it.\n\nPlease send **Kain Po Tayo Team Ryzza** together with a clear food photo or video."
    );

    return;
  }

  const emoji = aiResult.emoji || "🍽️";

  // ====================================================
  // APPROVED
  // ====================================================

  await sendPrivateDM(
    user,
    `✅ Your food submission was approved ${emoji}!\n\nIt will be posted in the Foodie channel in **30 seconds**.`
  );

  // ONLY approved submissions receive the 30-second delay.
  await wait(BOT_POST_DELAY_MS);

  const channel = await client.channels
    .fetch(FOOD_CHANNEL_ID)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error("Food channel could not be fetched.");
  }

  const attachment = new AttachmentBuilder(
    mediaBuffer,
    {
      name:
        fileName ||
        (mediaType === "video"
          ? `food-${Date.now()}.mp4`
          : `food-${Date.now()}.jpg`),
    }
  );

  const publicMessage = await channel.send({
    content:
      `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
      `👤 <@${user.id}>`,

    files: [attachment],

    allowedMentions: {
      users: [user.id],
    },
  });

  console.log(
    `Approved food posted for ${user.tag || user.id}: ${publicMessage.id}`
  );

  // ====================================================
  // PARTY CHAT NOTIFICATION
  // ====================================================

  try {
    const partyThread = await client.channels
      .fetch(PARTY_THREAD_ID)
      .catch(() => null);

    if (
      partyThread &&
      partyThread.isTextBased()
    ) {
      await partyThread.send({
        content:
          `**Kain Po Tayo**\n` +
          `🍽️ New food post from <@${user.id}>!`,

        allowedMentions: {
          users: [user.id],
        },
      });
    }
  } catch (error) {
    console.error(
      "Party Chat notification failed:",
      error.message
    );
  }
}

// ======================================================
// PARTY CHAT CHECK
// ======================================================

async function verifyPartyThread() {
  try {
    const thread = await client.channels
      .fetch(PARTY_THREAD_ID)
      .catch(() => null);

    if (!thread) {
      console.warn(
        `Party Chat thread ${PARTY_THREAD_ID} could not be fetched.`
      );

      return null;
    }

    console.log(
      `Party Chat connected: ${thread.name || PARTY_THREAD_NAME}`
    );

    return thread;
  } catch (error) {
    console.error(
      "Party Chat verification failed:",
      error.message
    );

    return null;
  }
}

// ======================================================
// FOODIE REMINDER
// ======================================================

function isFoodieReminder(message) {
  return (
    message.author?.id === client.user?.id &&
    message.embeds?.some(
      (embed) =>
        embed.title === "🍽️ Foodie Reminder"
    )
  );
}

async function ensureReminder(channel) {
  try {
    const messages = await channel.messages.fetch({
      limit: 100,
    });

    const existing = messages.find((message) =>
      isFoodieReminder(message)
    );

    if (existing) {
      if (!existing.pinned) {
        try {
          await existing.pin();
        } catch (error) {
          console.error(
            "Could not pin existing reminder:",
            error.message
          );
        }
      }

      return existing;
    }

    const embed = new EmbedBuilder()
      .setTitle("🍽️ Foodie Reminder")
      .setDescription(
        "Post your food here using **Kain Po Tayo Team Ryzza** + a food photo or video."
      );

    const reminder = await channel.send({
      embeds: [embed],
    });

    try {
      await reminder.pin();
    } catch (error) {
      console.error(
        "Could not pin Foodie reminder:",
        error.message
      );
    }

    return reminder;
  } catch (error) {
    console.error(
      "Foodie reminder error:",
      error.message
    );

    return null;
  }
}

// ======================================================
// MESSAGE HANDLER
// ======================================================

client.on("messageCreate", async (message) => {
  // Ignore all bots.
  if (message.author.bot) {
    return;
  }

  // Party Chat and every other channel are unrestricted.
  if (message.channelId !== FOOD_CHANNEL_ID) {
    return;
  }

  const hasTrigger = isExactTrigger(message.content);

  const attachments = [...message.attachments.values()];

  const imageAttachment = attachments.find(
    isImageAttachment
  );

  const videoAttachment = attachments.find(
    isVideoAttachment
  );

  // ====================================================
  // CASE 1:
  // EXACT TRIGGER + IMAGE
  // ====================================================

  if (hasTrigger && imageAttachment) {
    try {
      const buffer = await downloadAttachment(
        imageAttachment.url
      );

      /*
       * Delete the original member message BEFORE AI scanning.
       * Therefore the Foodie channel only retains approved bot posts.
       */
      await message.delete().catch(() => {});

      addToFoodQueue({
        user: message.author,
        mediaBuffer: buffer,
        mediaType: "image",
        fileName:
          imageAttachment.name ||
          `food-${Date.now()}.jpg`,
        contentType:
          imageAttachment.contentType ||
          "image/jpeg",
      });
    } catch (error) {
      console.error(
        "Image submission setup failed:",
        error
      );

      await message.delete().catch(() => {});

      await sendPrivateDM(
        message.author,
        "⚠️ I couldn't download your food photo. Please try sending it again."
      );
    }

    return;
  }

  // ====================================================
  // CASE 2:
  // EXACT TRIGGER + VIDEO
  // ====================================================

  if (hasTrigger && videoAttachment) {
    try {
      const buffer = await downloadAttachment(
        videoAttachment.url
      );

      /*
       * Delete BEFORE video frame extraction and AI scanning.
       */
      await message.delete().catch(() => {});

      addToFoodQueue({
        user: message.author,
        mediaBuffer: buffer,
        mediaType: "video",
        fileName:
          videoAttachment.name ||
          `food-${Date.now()}.mp4`,
        contentType:
          videoAttachment.contentType ||
          "video/mp4",
      });
    } catch (error) {
      console.error(
        "Video submission setup failed:",
        error
      );

      await message.delete().catch(() => {});

      await sendPrivateDM(
        message.author,
        "⚠️ I couldn't download your food video. Please try sending it again."
      );
    }

    return;
  }

  // ====================================================
  // CASE 3:
  // EXACT TRIGGER + NO MEDIA
  // ====================================================

  if (hasTrigger) {
    await message.delete().catch(() => {});

    await sendPrivateDM(
      message.author,
      "🍽️ Please send **Kain Po Tayo Team Ryzza** together with a **food photo or video**."
    );

    return;
  }

  // ====================================================
  // CASE 4:
  // ANYTHING ELSE
  //
  // Hello
  // Hi
  // Good morning
  // Random text
  // Emoji only
  // Photo only
  // Video only
  // Wrong text + photo
  // Wrong text + video
  // ====================================================

  await message.delete().catch(() => {});

  // Only send a DM when they attached media.
  // Random text is simply deleted with no AI and no delay.
  if (attachments.length > 0) {
    await sendPrivateDM(
      message.author,
      "❌ Food submissions must use the exact phrase **Kain Po Tayo Team Ryzza** together with your food photo or video."
    );
  }
});

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {
  console.log(
    `Logged in as ${client.user.tag}`
  );

  try {
    const channel = await client.channels
      .fetch(FOOD_CHANNEL_ID)
      .catch(() => null);

    if (!channel) {
      console.error(
        `Food channel ${FOOD_CHANNEL_ID} could not be found.`
      );
      return;
    }

    if (!channel.isTextBased()) {
      console.error(
        "Configured Foodie channel is not a text channel."
      );
      return;
    }

    console.log(
      `Foodie channel connected: ${channel.name}`
    );

    // Keep the reminder.
    await ensureReminder(channel);

    // Verify the existing Party Chat thread.
    await verifyPartyThread();

    console.log(
      "Kain Po Tayo Team Ryzza Foodie system is ready."
    );
  } catch (error) {
    console.error(
      "Startup setup error:",
      error
    );
  }
});

// ======================================================
// DISCORD LOGIN
// ======================================================

client.login(DISCORD_TOKEN).catch((error) => {
  console.error(
    "Discord login failed:",
    error
  );

  process.exit(1);
});
