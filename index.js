const express = require("express");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  MessageFlags
} = require("discord.js");
const OpenAI = require("openai");
const ffmpegPath = require("ffmpeg-static");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

// ============================================================
// CONFIG
// ============================================================

const PORT = process.env.PORT || 10000;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const FOOD_CHANNEL_ID = "1550189625954402314";

const TRIGGER = "kain po tayo team ryzza";

const AI_MODEL = "gpt-5.6-luna";

// ============================================================
// ENVIRONMENT
// ============================================================

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing.");
  process.exit(1);
}

// ============================================================
// HEALTH SERVER
// ============================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});

// ============================================================
// OPENAI
// ============================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ============================================================
// DISCORD
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ============================================================
// TEMP DIRECTORY
// ============================================================

const TEMP_DIR = path.join(os.tmpdir(), "foodie-flex");

async function ensureTempDir() {
  await fsp.mkdir(TEMP_DIR, { recursive: true });
}

// ============================================================
// BASIC HELPERS
// ============================================================

function hasTrigger(message) {
  return message.content
    .toLowerCase()
    .includes(TRIGGER);
}

function isImage(attachment) {
  const type = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    type.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(name)
  );
}

function isGif(attachment) {
  const type = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    type === "image/gif" ||
    /\.gif$/i.test(name)
  );
}

function isVideo(attachment) {
  const type = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    type.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(name)
  );
}

function isAudio(attachment) {
  const type = attachment.contentType || "";
  const name = attachment.name || "";

  return (
    type.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(name)
  );
}

function getMedia(message) {
  return [...message.attachments.values()].filter(
    attachment =>
      isImage(attachment) || isVideo(attachment)
  );
}

// ============================================================
// VOICE MESSAGE DETECTION
// ============================================================

function isVoiceMessage(message) {
  if (
    message.flags &&
    typeof message.flags.has === "function" &&
    message.flags.has(MessageFlags.IsVoiceMessage)
  ) {
    return true;
  }

  for (const attachment of message.attachments.values()) {
    if (
      attachment.duration_secs !== undefined ||
      attachment.waveform !== undefined
    ) {
      return true;
    }
  }

  return false;
}

// ============================================================
// DELETE
// ============================================================

async function removeMessage(message, reason) {
  try {
    console.log("========================================");
    console.log("🗑️ REMOVING MESSAGE");
    console.log(`Author: ${message.author?.tag}`);
    console.log(`Message ID: ${message.id}`);
    console.log(`Reason: ${reason}`);
    console.log("========================================");

    await message.delete();

    console.log("✅ Removed successfully.");

    return true;
  } catch (error) {
    console.error(
      "❌ Delete failed:",
      error.message
    );

    return false;
  }
}

// ============================================================
// PRIVATE SENDER STATUS
// ============================================================

async function sendPrivateStatus(user, text) {
  try {
    await user.send(text);

    console.log(
      `📩 Private status sent to ${user.tag}`
    );

    return true;
  } catch (error) {
    console.log(
      `⚠️ Could not DM ${user.tag}: ${error.message}`
    );

    return false;
  }
}

// ============================================================
// DOWNLOAD
// ============================================================

async function downloadFile(url, extension) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Download failed: HTTP ${response.status}`
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  const filename =
    `${crypto.randomBytes(8).toString("hex")}.${extension}`;

  const filePath =
    path.join(TEMP_DIR, filename);

  await fsp.writeFile(
    filePath,
    buffer
  );

  return filePath;
}

// ============================================================
// FFMPEG
// ============================================================

function extractFrames(inputPath, prefix) {
  return new Promise((resolve, reject) => {
    const outputPattern =
      `${prefix}-%02d.jpg`;

    const args = [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "fps=2",
      "-frames:v",
      "4",
      "-q:v",
      "3",
      outputPattern
    ];

    const ffmpeg =
      spawn(ffmpegPath, args);

    let stderr = "";

    ffmpeg.stderr.on(
      "data",
      data => {
        stderr += data.toString();
      }
    );

    ffmpeg.on(
      "error",
      reject
    );

    ffmpeg.on(
      "close",
      async code => {
        if (code !== 0) {
          reject(
            new Error(
              `FFmpeg failed: ${stderr}`
            )
          );

          return;
        }

        try {
          const files =
            await fsp.readdir(TEMP_DIR);

          const frames =
            files
              .filter(file =>
                file.startsWith(
                  path.basename(prefix)
                )
              )
              .filter(file =>
                file.endsWith(".jpg")
              )
              .map(file =>
                path.join(
                  TEMP_DIR,
                  file
                )
              )
              .sort();

          resolve(frames);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

// ============================================================
// AI — IMAGE
// ============================================================

async function checkImage(imageUrl) {
  console.log("🤖 AI checking image...");

  try {
    const response =
      await openai.responses.create({
        model: AI_MODEL,

        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Look at this image. " +
                  "Determine whether it clearly contains food or a meal. " +
                  "Reply with ONLY FOOD or NOT_FOOD."
              },
              {
                type: "input_image",
                image_url: imageUrl
              }
            ]
          }
        ]
      });

    const result =
      response.output_text
        .trim()
        .toUpperCase();

    console.log(
      `🤖 AI result: ${result}`
    );

    return result.includes("FOOD");
  } catch (error) {
    console.error(
      "❌ AI image error:",
      error.message
    );

    return false;
  }
}

// ============================================================
// AI — GIF / VIDEO FRAMES
// ============================================================

async function checkFrames(framePaths) {
  console.log(
    `🤖 AI checking ${framePaths.length} frame(s)...`
  );

  const content = [
    {
      type: "input_text",
      text:
        "These are frames from a GIF or video. " +
        "Determine whether they contain food or a meal. " +
        "Reply with ONLY FOOD or NOT_FOOD."
    }
  ];

  for (const frame of framePaths) {
    const buffer =
      await fsp.readFile(frame);

    content.push({
      type: "input_image",
      image_url:
        `data:image/jpeg;base64,${buffer.toString("base64")}`
    });
  }

  try {
    const response =
      await openai.responses.create({
        model: AI_MODEL,

        input: [
          {
            role: "user",
            content
          }
        ]
      });

    const result =
      response.output_text
        .trim()
        .toUpperCase();

    console.log(
      `🤖 AI result: ${result}`
    );

    return result.includes("FOOD");
  } catch (error) {
    console.error(
      "❌ AI frame error:",
      error.message
    );

    return false;
  }
}

// ============================================================
// AI MEDIA CHECK
// ============================================================

async function checkMedia(attachment) {
  // IMAGE
  if (
    isImage(attachment) &&
    !isGif(attachment)
  ) {
    return await checkImage(
      attachment.url
    );
  }

  // GIF
  if (isGif(attachment)) {
    let inputPath = null;
    let frames = [];

    try {
      inputPath =
        await downloadFile(
          attachment.url,
          "gif"
        );

      const prefix =
        path.join(
          TEMP_DIR,
          `gif-${crypto.randomBytes(6).toString("hex")}`
        );

      frames =
        await extractFrames(
          inputPath,
          prefix
        );

      if (!frames.length) {
        return false;
      }

      return await checkFrames(frames);
    } catch (error) {
      console.error(
        "❌ GIF check failed:",
        error.message
      );

      return false;
    } finally {
      if (inputPath) {
        await fsp.unlink(
          inputPath
        ).catch(() => {});
      }

      for (const frame of frames) {
        await fsp.unlink(
          frame
        ).catch(() => {});
      }
    }
  }

  // VIDEO
  if (isVideo(attachment)) {
    let inputPath = null;
    let frames = [];

    try {
      let extension = "mp4";

      if (/\.(webm)$/i.test(attachment.name || "")) {
        extension = "webm";
      }

      if (/\.(mov)$/i.test(attachment.name || "")) {
        extension = "mov";
      }

      if (/\.(mkv)$/i.test(attachment.name || "")) {
        extension = "mkv";
      }

      inputPath =
        await downloadFile(
          attachment.url,
          extension
        );

      const prefix =
        path.join(
          TEMP_DIR,
          `video-${crypto.randomBytes(6).toString("hex")}`
        );

      frames =
        await extractFrames(
          inputPath,
          prefix
        );

      if (!frames.length) {
        return false;
      }

      return await checkFrames(frames);
    } catch (error) {
      console.error(
        "❌ Video check failed:",
        error.message
      );

      return false;
    } finally {
      if (inputPath) {
        await fsp.unlink(
          inputPath
        ).catch(() => {});
      }

      for (const frame of frames) {
        await fsp.unlink(
          frame
        ).catch(() => {});
      }
    }
  }

  return false;
}

// ============================================================
// FOOD EMOJI
// ============================================================

function chooseFoodEmoji(text) {
  const value =
    text.toLowerCase();

  if (
    value.includes("pizza")
  ) return "🍕";

  if (
    value.includes("burger") ||
    value.includes("hamburger")
  ) return "🍔";

  if (
    value.includes("fries") ||
    value.includes("french fries")
  ) return "🍟";

  if (
    value.includes("chicken")
  ) return "🍗";

  if (
    value.includes("noodle") ||
    value.includes("ramen") ||
    value.includes("pasta")
  ) return "🍜";

  if (
    value.includes("rice")
  ) return "🍚";

  if (
    value.includes("cake") ||
    value.includes("dessert")
  ) return "🍰";

  if (
    value.includes("ice cream")
  ) return "🍦";

  if (
    value.includes("coffee")
  ) return "☕";

  if (
    value.includes("drink") ||
    value.includes("juice") ||
    value.includes("milk")
  ) return "🥤";

  return "🍽️";
}

// ============================================================
// PUBLIC APPROVED POST
// ============================================================

async function publishApprovedFood(
  message,
  attachment
) {
  const emoji =
    chooseFoodEmoji(
      message.content
    );

  const sender =
    message.author;

  try {
    await message.channel.send({
      content:
        `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
        `👤 ${sender}`,
      files: [
        {
          attachment: attachment.url,
          name:
            attachment.name ||
            "food"
        }
      ],
      allowedMentions: {
        users: [
          sender.id
        ]
      }
    });

    console.log(
      `📢 Public approved post sent for ${sender.tag}`
    );

    return true;
  } catch (error) {
    console.error(
      "❌ Failed to publish:",
      error.message
    );

    return false;
  }
}

// ============================================================
// REMINDER
// ============================================================

async function ensureReminder(channel) {
  try {
    const messages =
      await channel.messages.fetch({
        limit: 50
      });

    const existing =
      messages.find(
        msg =>
          msg.author?.id === client.user.id &&
          msg.embeds.some(
            embed =>
              embed.title ===
              "🍽️ Foodie Reminder"
          )
      );

    if (existing) {
      if (!existing.pinned) {
        await existing.pin().catch(() => {});
      }

      return;
    }

    const reminder =
      await channel.send({
        embeds: [
          {
            title:
              "🍽️ Foodie Reminder",

            description:
              "To post your food picture:\n\n" +
              "**Say Kain Po Tayo Team Ryzza**\n" +
              "together with your food picture.\n\n" +
              "🤖 **The Bot**\n" +
              "will check your picture and only allow food pictures."
          }
        ]
      });

    await reminder.pin().catch(() => {});

    console.log(
      "📌 Food reminder created and pinned."
    );
  } catch (error) {
    console.error(
      "❌ Reminder error:",
      error.message
    );
  }
}

// ============================================================
// CLEANUP OLD MESSAGES
// ============================================================

async function cleanupChannel(channel) {
  console.log("========================================");
  console.log("🧹 FULL CLEANUP STARTED");
  console.log("========================================");

  let scanned = 0;
  let deleted = 0;
  let foodKept = 0;

  let before;

  while (true) {
    let batch;

    try {
      const options = {
        limit: 100
      };

      if (before) {
        options.before = before;
      }

      batch =
        await channel.messages.fetch(
          options
        );
    } catch (error) {
      console.error(
        "❌ History fetch failed:",
        error.message
      );

      break;
    }

    if (!batch.size) {
      break;
    }

    console.log(
      `📥 Fetched ${batch.size} messages`
    );

    for (const message of batch.values()) {
      scanned++;

      if (
        message.author.id ===
        client.user.id
      ) {
        continue;
      }

      // VOICE
      if (isVoiceMessage(message)) {
        if (
          await removeMessage(
            message,
            "Voice message"
          )
        ) deleted++;

        continue;
      }

      // STICKER
      if (
        message.stickers.size > 0
      ) {
        if (
          await removeMessage(
            message,
            "Sticker"
          )
        ) deleted++;

        continue;
      }

      // AUDIO
      const audio =
        [...message.attachments.values()]
          .some(isAudio);

      if (audio) {
        if (
          await removeMessage(
            message,
            "Audio"
          )
        ) deleted++;

        continue;
      }

      const media =
        getMedia(message);

      // TEXT / EMOJI
      if (!media.length) {
        if (
          await removeMessage(
            message,
            "Text / emoji without picture or video"
          )
        ) deleted++;

        continue;
      }

      // MEDIA WITHOUT TRIGGER
      if (!hasTrigger(message)) {
        if (
          await removeMessage(
            message,
            "Picture / video without trigger"
          )
        ) deleted++;

        continue;
      }

      // MEDIA + TRIGGER
      let food = false;

      for (const attachment of media) {
        if (
          await checkMedia(
            attachment
          )
        ) {
          food = true;
          break;
        }
      }

      if (food) {
        foodKept++;

        console.log(
          `🍽️ Existing food kept from ${message.author.tag}`
        );
      } else {
        if (
          await removeMessage(
            message,
            "AI rejected as non-food"
          )
        ) deleted++;
      }
    }

    const oldest =
      batch.last();

    if (!oldest) {
      break;
    }

    before =
      oldest.id;

    if (batch.size < 100) {
      break;
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          250
        )
    );
  }

  console.log("========================================");
  console.log("🧹 CLEANUP COMPLETE");
  console.log(`Scanned: ${scanned}`);
  console.log(`Deleted: ${deleted}`);
  console.log(`Food kept: ${foodKept}`);
  console.log("========================================");

  return {
    scanned,
    deleted,
    foodKept
  };
}

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {
  console.log("========================================");
  console.log(
    `🤖 Logged in as ${client.user.tag}`
  );
  console.log(
    `🍽️ Food channel: ${FOOD_CHANNEL_ID}`
  );
  console.log("========================================");

  try {
    const channel =
      await client.channels.fetch(
        FOOD_CHANNEL_ID
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      console.error(
        "❌ Food channel unavailable."
      );

      return;
    }

    await ensureReminder(channel);
  } catch (error) {
    console.error(
      "❌ Startup channel error:",
      error.message
    );
  }
});

// ============================================================
// MESSAGE FLOW
// ============================================================

client.on(
  "messageCreate",
  async message => {
    try {
      // --------------------------------------------------------
      // FOOD CHANNEL ONLY
      // --------------------------------------------------------

      if (
        message.channel.id !==
        FOOD_CHANNEL_ID
      ) {
        return;
      }

      // --------------------------------------------------------
      // OWN BOT MESSAGES
      // --------------------------------------------------------

      if (
        message.author.id ===
        client.user.id
      ) {
        return;
      }

      // --------------------------------------------------------
      // CLEANUP COMMAND
      // --------------------------------------------------------

      if (
        message.content
          .trim()
          .toLowerCase() ===
        "!cleanup"
      ) {
        if (
          !message.member?.permissions.has(
            PermissionsBitField.Flags.ManageMessages
          )
        ) {
          await message.reply(
            "❌ You need **Manage Messages** permission."
          );

          return;
        }

        const result =
          await cleanupChannel(
            message.channel
          );

        await message.delete().catch(
          () => {}
        );

        const summary =
          await message.channel.send({
            content:
              `🧹 **Cleanup complete**\n` +
              `Scanned: **${result.scanned}**\n` +
              `Deleted: **${result.deleted}**\n` +
              `Food kept: **${result.foodKept}**`
          });

        setTimeout(
          () =>
            summary.delete().catch(
              () => {}
            ),
          15000
        );

        return;
      }

      // ========================================================
      // EVERYTHING BELOW IS AUTOMATIC
      // ========================================================

      // --------------------------------------------------------
      // VOICE MESSAGE
      // --------------------------------------------------------

      if (
        isVoiceMessage(message)
      ) {
        await removeMessage(
          message,
          "Voice message"
        );

        return;
      }

      // --------------------------------------------------------
      // STICKER
      // --------------------------------------------------------

      if (
        message.stickers.size > 0
      ) {
        await removeMessage(
          message,
          "Sticker"
        );

        return;
      }

      // --------------------------------------------------------
      // AUDIO
      // --------------------------------------------------------

      const audio =
        [...message.attachments.values()]
          .some(isAudio);

      if (audio) {
        await removeMessage(
          message,
          "Audio"
        );

        return;
      }

      // --------------------------------------------------------
      // MEDIA
      // --------------------------------------------------------

      const media =
        getMedia(message);

      // --------------------------------------------------------
      // NO PICTURE / VIDEO
      // --------------------------------------------------------

      if (!media.length) {
        await removeMessage(
          message,
          "Text / emoji / trigger without picture or video"
        );

        return;
      }

      // --------------------------------------------------------
      // PICTURE / VIDEO WITHOUT TRIGGER
      // --------------------------------------------------------

      if (!hasTrigger(message)) {
        await removeMessage(
          message,
          "Picture / video without trigger"
        );

        return;
      }

      // ========================================================
      // ONLY HERE DOES AI RUN
      // ========================================================

      console.log(
        "🤖 Trigger + picture/video detected."
      );

      // --------------------------------------------------------
      // SAVE SENDER BEFORE DELETE
      // --------------------------------------------------------

      const sender =
        message.author;

      // --------------------------------------------------------
      // DELETE ORIGINAL IMMEDIATELY
      // --------------------------------------------------------

      await removeMessage(
        message,
        "Submission received — private AI checking"
      );

      // --------------------------------------------------------
      // PRIVATE STATUS
      // --------------------------------------------------------

      await sendPrivateStatus(
        sender,
        "🤖 **Your Kain Po Tayo Team Ryzza submission is being checked.**\n\n" +
        "Your original message has been removed from the channel while the bot checks your picture/video."
      );

      // --------------------------------------------------------
      // AI CHECK
      // --------------------------------------------------------

      let approved =
        null;

      for (
        const attachment of media
      ) {
        const result =
          await checkMedia(
            attachment
          );

        if (result) {
          approved =
            attachment;

          break;
        }
      }

      // --------------------------------------------------------
      // APPROVED
      // --------------------------------------------------------

      if (approved) {
        console.log(
          `✅ FOOD APPROVED for ${sender.tag}`
        );

        const published =
          await publishApprovedFood(
            message,
            approved
          );

        if (published) {
          await sendPrivateStatus(
            sender,
            "✅ **Your food submission was approved!**\n\n" +
            "It has been posted in the food channel and your username was mentioned."
          );
        }

        return;
      }

      // --------------------------------------------------------
      // REJECTED
      // --------------------------------------------------------

      console.log(
        `❌ NOT FOOD for ${sender.tag}`
      );

      await sendPrivateStatus(
        sender,
        "❌ **Your submission was not approved.**\n\n" +
        "The AI check did not identify food in the picture/video, so it was not posted publicly."
      );
    } catch (error) {
      console.error(
        "❌ Message handler error:",
        error
      );
    }
  }
);

// ============================================================
// LOGIN
// ============================================================

ensureTempDir()
  .then(async () => {
    console.log(
      "📁 Temporary directory ready."
    );

    await client.login(
      DISCORD_TOKEN
    );

    console.log(
      "🔐 Discord login started."
    );
  })
  .catch(error => {
    console.error(
      "❌ Startup failed:",
      error
    );

    process.exit(1);
  });
