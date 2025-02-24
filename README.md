# QuickTranslateBot
## 简介
`Quick Translate Bot` 是一个基于 Cloudflare Workers 部署的 Telegram Bot 的翻译机器人，支持自动中英文互译，能够处理群组和私聊中的翻译请求。  
用户可以通过简单的与机器人交互，机器人会根据文本自动识别语言并返回翻译结果。

## 功能
- **中英互译**：自动识别文本语言，支持中文和英文互译。
- **群组支持**：支持在群组中提及机器人并进行翻译，还支持识别回复的信息。

## 部署
### 1. 环境准备
此代码可以在 Cloudflare Workers 的平台上运行。

### 3. 部署
直接新建一个 Cloudflare Workers 项目，然后复制 [worker.js](worker.js) 文件再粘贴，保存并部署，即可。

### 3. 配置环境变量
- **SECRET_TOKEN**：设置 Telegram Webhook 时设置的 Secret Token。
- **MAX_TIME_DIFF**：设置接受 Webhook 处理的最大时间差，单位秒，默认为 `20` 秒。
- **ENABLE_GROUP_FEATURE**：设置是否启用群组功能，默认为 `false`。
- **TELEGRAM_BOT_NAME**：设置 Telegram 机器人用户名。
- **TELEGRAM_BOT_TOKEN**：将你从 [BotFather](http://t.me/BotFather) 获取到的 Telegram Bot Token 填入此处。

### 4. 设置 Telegram Webhook
部署完成后，你需要设置 Telegram 机器人的 Webhook 地址，指向你的 Cloudflare Workers URL，并添加 Secret Token。

直接使用浏览器访问即可：
```txt
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>/bot/webhook&secret_token=<SECRET_TOKEN>
```

## 主要功能说明
### 1. `/start` 命令
在 Telegram 中发送 `/start` 命令时，机器人会向用户发送欢迎信息。

### 2. `/report` 命令
在 Telegram 中发送 `/report` 命令时，机器人会返回程序的基本信息，包括版本、当前服务器时间、以及作者信息。

### 3. 群组功能
- 如果群组功能启用，用户可以在群组中提及机器人并发送要翻译的文本，机器人会自动回复翻译结果。  
- 用户必须在提及机器人后提供要翻译的文本，否则机器人会提示用户输入翻译内容。  
- 在群组中用户需要先提及机器人，然后空格加命令才能在群组中使用命令。  
- 用户也可以引用一条信息并提及机器人，这样机器人会回复引用信息的翻译结果。

### 4. 翻译功能
机器人会自动识别输入文本的语言，并翻译为另一种语言。当前仅支持中文和英文互译。

- 中文翻译为英文。
- 英文翻译为中文。

### 5. 媒体消息
目前，机器人仅支持翻译文本消息。

## 常见问题
### 1. 如何修改翻译方向？
目前，翻译方向是自动识别的，即中文翻译成英文，英文翻译成中文。若希望修改此逻辑，需在代码中调整翻译目标语言。

### 2. 如何启用群组功能？
通过设置环境变量 `ENABLE_GROUP_FEATURE` 为 `true` 即可启用群组功能。然后，在群组中提及机器人时，它会尝试翻译消息。

### 3. 如何查看机器人日志？
如果你在部署过程中遇到问题，可以使用 Cloudflare Workers 自带的功能查看日志输出。
