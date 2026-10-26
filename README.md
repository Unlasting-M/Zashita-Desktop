# Zashita Desktop

[English](README.en.md) · [Русский](README.ru.md)

独立运行的 Windows 俄语论文答辩助手。实时转写老师的俄语提问，结合论文资料生成俄语答案与中文对照。

**直接下载安装包，无需 GPT 账号、托管网页、Python 或本地语音模型。** 语音识别和问答分别调用使用者自己的百炼与 DeepSeek API，需要联网。

## 下载与安装

在 [Releases](https://github.com/Unlasting-M/Zashita-Desktop/releases) 下载：

- `Zashita-Setup-2.0.0-x64.exe`：安装版，可选安装目录、桌面快捷方式。
- `Zashita-Portable-2.0.0-x64.exe`：免安装版，双击运行；资料仍保存到当前 Windows 用户目录。

面向 Windows 10/11 x64。桌面背景磨砂透视需要 Windows 11 22H2 或更高版本及系统效果支持；标题栏可关闭磨砂或开启置顶。当前安装包未签名。

## 开始使用

1. 打开“设置”，填写百炼和 DeepSeek API Key，点击“保存密钥”。百炼 Key 的地域须与所选北京或新加坡一致；语音模型为 `qwen3-asr-flash-realtime`，语言为俄语。
2. 选择麦克风（可选 UU 等虚拟设备），或选择“系统音频”采集电脑正在播放的会议声音。设备偏好自动保存；暂时断开的设备不会被默认设备覆盖。
3. 导入可选中文字的 PDF、DOCX、UTF-8 TXT 或 Markdown。每份最多 20MB，PDF 最多 250 页；扫描件需先 OCR。
4. 点击“开始收音”，用“老师提问 / 我在回答”切换当前发言角色。同一来源的多人发言不自动分离。
5. 新问题后台排队，保留当前阅读位置；读完点击“下一题”。可打开“手动提问或补抓”补充问题。

## 主要功能

- 16kHz PCM 实时俄语识别，只有 final 结果进入问题检测。
- 不依赖问号：俄语疑问词、`ли`、祈使提问及老师长句进入语义判断。
- 合并相邻续句，提取时附带最近五条上下文；根据已出现完整术语还原 ASR 缩写。
- 本地关键词检索论文，发送命中的片段到 DeepSeek；俄语口语答案配中文问题与答案翻译。
- 问题队列、历史记录、资料库、JSON 导入导出、窗口置顶和可关闭的桌面磨砂。

## 数据与旧版迁移

- 资料、记录和偏好保存在 `%APPDATA%\ZashitaDesktop`。密钥通过 Electron `safeStorage` 使用 Windows 系统加密，单独保存，不进入导出备份。
- 内置服务仅监听 `127.0.0.1:18789`；API 使用每次启动生成的会话凭证。端口占用时会提示退出冲突程序。
- 音频直接发送到阿里云，问题、上下文和检索片段直接发送到 DeepSeek。没有 GPT 网站中转服务。
- 网页版“导出备份”得到的 JSON 可在电脑版设置页导入。旧 1.x Windows 补丁版的数据库不直接兼容，请重新导入论文；本程序不改动旧版目录。
- 关闭程序会停止收音；最小化可继续。休眠、锁屏、断网或设备掉线可能中断，重连后可继续阅读原记录。

这是基于作者 Zashita 网页核心重新整理的完整桌面源码，不包含旧 Copy InterviewDog 安装包、反编译模块或其专有后端。旧版离线 Whisper 模型不随本版提供。

## 从源码运行与打包

安装 Node.js 24 LTS 与 npm，在项目目录执行：

```powershell
npm ci
npm run build
npm start
```

```powershell
npm test
npm run test:desktop
npm run package:win
```

安装包输出到 `release/`。首次运行会下载 Electron，打包工具也需要联网下载构建资源。无需另外启动后端或配置部署平台。Windows 安装包请在 Windows 构建；代码签名证书由发布者自行配置。

`test:desktop` 启动隔离测试用户目录，使用假密钥和本地模拟模型，不采集真实音频、不调用付费 API；覆盖重启恢复、资料导入和问题队列。它不替代真实麦克风、WASAPI 及云端账户的现场验收。详见 [验证说明](docs/VALIDATION.md)。

## 源码结构

| 路径 | 用途 |
| --- | --- |
| `desktop/main.cjs` | Windows 窗口、音频权限、系统音频与受限 IPC |
| `desktop/server.mjs` | 内置 HTTP / WebSocket 本地服务 |
| `desktop/vault.mjs` | Windows 加密密钥保存 |
| `src/client.mjs` | 答辩、队列、资料和设置界面 |
| `src/audio.mjs` | 麦克风 / 系统音频及 PCM 重采样 |
| `src/backend.mjs` | Qwen 协议与 DeepSeek 问答 |
| `src/core.mjs` | 俄语规则、术语修复、本地检索 |
| `tests/` | 核心及 Electron 验证脚本 |

MIT License。第三方组件许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

by xinyu
