// 程序基本信息
const programName = "Quick Translate Bot";
const Version = "1.0.0";
const DEV_MODE = false; // 开发模式

// 处理 HTTP 请求
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (pathname === "/bot/webhook") {
        return await handleTelegramUpdate(request, env);
      }

      return new Response(null, { status: 404 });
    } catch (error) {
      return handleError(error);
    }
  }
};

// 处理 Telegram 更新消息
async function handleTelegramUpdate(request, env) {
  const SECRET_TOKEN = env.SECRET_TOKEN;
  const ENABLE_GROUP_FEATURE = env.ENABLE_GROUP_FEATURE;
  const TELEGRAM_BOT_NAME = env.TELEGRAM_BOT_NAME;
  const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;

  try {
    // 验证 Telegram 的 Secret Token
    const receivedToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (receivedToken !== SECRET_TOKEN) {
      return new Response(null, { status: 403 });
    }

    const update = await request.json();
    const message = update.message || update.edited_message;

    if (!message) return new Response(null, { status: 200 });

    const { text, chat, message_id, from, entities } = message;
    const { id: chat_id, type: chat_type } = chat;
    const { id: user_id, username = "Unknown" } = from;

    // 检查聊天类型是否不为私聊
    if (chat_type !== "private") {
      // 检查是否在群组中提及了机器人
      if (ENABLE_GROUP_FEATURE && text && entities) {
        const botMentioned = entities.some(entity =>
          entity.type === 'mention' &&
          text.slice(entity.offset, entity.offset + entity.length) === `@${TELEGRAM_BOT_NAME}`
        );

        if (botMentioned) {
          const messageText = text.slice(entities.find(e => e.type === 'mention').offset + `@${TELEGRAM_BOT_NAME}`.length).trim();

          // 如果@后面没有文本，发送提示信息
          if (!messageText) {
            return sendMessage(chat_id, "您好，欢迎提及！请在提及后面输入您需要翻译的文本。", message_id, TELEGRAM_BOT_TOKEN);
          }

          // 处理开始命令
          if (messageText === "/start") {
            return sendMessage(chat_id, `\n好！让我们开始翻译，谢谢使用 ${programName} v${Version}！\n请您将要翻译的文本通过提及发送给我，目前仅支持中英互译，我会自动识别并回复翻译结果。`, message_id, TELEGRAM_BOT_TOKEN);
          }

          // 处理报告命令
          if (messageText === "/report") {
            const serverTime = new Date().toISOString();
            return sendMessage(chat_id, `\n程序名：${programName}\n版本：${Version}\n服务器时间：${serverTime}\n\n用户名：@${username}\n用户ID：${user_id}\n聊天ID：${chat_id}\n聊天类型：${chat_type}\n\n作者：molikai-work\nGitHub：https://github.com/molikai-work/QuickTranslateBot`, message_id, TELEGRAM_BOT_TOKEN);
          }

          // 处理群组消息
          return await handleGroupMessage(messageText, chat_id, message_id, TELEGRAM_BOT_TOKEN);
        }
      }

      // 如果不是私聊，且群组功能没有启用或没有@bot，直接忽略处理
      return new Response(null, { status: 200 });
    }

    // 处理贴纸消息
    if (message.sticker) {
      return sendSticker(chat_id, message.sticker.file_id, message_id, TELEGRAM_BOT_TOKEN);
    }

    // 处理图片、视频、文件等其他媒体类型
    if (message.photo || message.document || message.video || message.audio || message.voice) {
      return sendMessage(chat_id, "抱歉，目前我不支持处理图片、视频、音频或文件等媒体类型。只支持对文本进行翻译。", message_id, TELEGRAM_BOT_TOKEN);
    }

    // 如果没有 text
    if (!text) {
      return sendSticker(chat_id, "请发送需要翻译的文本。", message_id, TELEGRAM_BOT_TOKEN);
    }

    // 处理开始命令
    if (text === "/start") {
      return sendMessage(chat_id, `\n好！让我们开始翻译，谢谢使用 ${programName} v${Version}！\n请您直接的将要翻译的文本发送给我，目前仅支持中英互译，我会自动识别并回复翻译结果。`, message_id, TELEGRAM_BOT_TOKEN);
    }

    // 处理报告命令
    if (text === "/report") {
      const serverTime = new Date().toISOString();
      return sendMessage(chat_id, `\n程序名：${programName}\n版本：${Version}\n服务器时间：${serverTime}\n\n用户名：@${username}\n用户ID：${user_id}\n聊天类型：${chat_type}\n\n作者：molikai-work\nGitHub：https://github.com/molikai-work/QuickTranslateBot`, message_id, TELEGRAM_BOT_TOKEN);
    }

    // 处理翻译请求
    const translatedText = await handleTranslation(text);
    return sendMessage(chat_id, translatedText, message_id, TELEGRAM_BOT_TOKEN);
  } catch (error) {
    return handleError(error);
  }
}

// 处理群组消息
async function handleGroupMessage(text, chat_id, message_id, TELEGRAM_BOT_TOKEN) {
  // 判断群组消息中的文本，决定是否翻译
  const translatedText = await handleTranslation(text);
  return sendMessage(chat_id, translatedText, message_id, TELEGRAM_BOT_TOKEN);
}

// 处理翻译请求
async function handleTranslation(text) {
  const GOOGLE_TRANSLATE_API = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=";

  // 根据消息内容判断目标语言（如果是中文则翻译成英文，反之亦然）
  const targetLang = /[\p{Script=Han}]/u.test(text.trim()) ? "en" : "zh-CN";
  const translateUrl = `${GOOGLE_TRANSLATE_API}${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  const translateResponse = await fetch(translateUrl);
  if (!translateResponse.ok) throw new Error("Failed to fetch translation");

  const translateData = await translateResponse.json();
  return translateData[0].map(item => item[0]).join(""); // 返回翻译结果
}

// 发送文本消息
async function sendMessage(chat_id, text, reply_to_message_id, token) {
  const sendMessageUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  const responsePayload = {
    chat_id, text,
    reply_to_message_id,
    disable_web_page_preview: "true",
  };

  await fetch(sendMessageUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(responsePayload)
  });

  return new Response(null, { status: 200 });
}

// 发送贴纸消息
async function sendSticker(chat_id, sticker_id, reply_to_message_id, token) {
  const sendStickerUrl = `https://api.telegram.org/bot${token}/sendSticker`;
  const responsePayload = { chat_id, sticker: sticker_id, reply_to_message_id };

  await fetch(sendStickerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(responsePayload)
  });

  return new Response(null, { status: 200 });
}

// 错误处理函数
function handleError(error) {
  console.error("Error:", error);
  const errorMessage = DEV_MODE ? `Error: ${error.message}` : "Internal server error";
  return new Response(errorMessage, { status: 500 });
}
