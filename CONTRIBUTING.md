# 贡献指南

感谢你愿意改进 DSH DevTools。这个项目默认使用中文交流；英文 issue 也可以。

## 提交问题

- 使用 GitHub Issues 报告 bug 或提出功能建议。
- 涉及连接失败时，请附上 provider、DSH 版本、错误文本和复现步骤。
- **不要提交 token、OAuth code、client secret、完整凭据文件或包含隐私的 MCP 结果。**
- 安全漏洞请不要开公开 issue，改用仓库的 GitHub Security Advisories 私下报告。

## 开发

项目没有构建步骤，也没有运行时 npm 依赖。

```bash
git clone https://github.com/lukema95/dsh-devtools.git
cd dsh-devtools
npm test
```

测试使用临时的 `DSH_HOME`，不会读写真实的 provider 配置或凭据。

主要文件：

- `host/plugin.js`：Host 侧生命周期、provider、工具治理和 API。
- `host/oauth.js`：OAuth 发现、动态注册、PKCE、回调和刷新。
- `host/selection.js`：推荐工具集和 usage 相关逻辑。
- `host/presets.js`：内置 provider 定义。
- `host/state.js`：本地状态校验和迁移。
- `client.js`：DevTools UI。
- `test/`：Host、工具选择、OAuth 和客户端注册测试。

## Pull Request

1. 先开 issue 描述要解决的问题，除非是明显的小修复。
2. 保持改动聚焦；不要顺带重排无关代码。
3. 提交前运行：

   ```bash
   npm test
   ```

4. 更新 README 时同时更新 `README.md` 和 `README.en.md`。
5. 不要提交 `state.json`、`.credentials.yaml`、token 或本地绝对路径。
6. Figma 的临时兼容客户端属于 provider 策略变通，改动前请先讨论，避免让它变成不可维护的隐式依赖。

## 代码风格

- 使用 ESM 和 Node 内置模块；Host 侧尽量不新增依赖。
- 新 provider 必须同时考虑：凭据存储、OAuth 刷新、工具发现、推荐集、权限治理和卸载清理。
- 面向用户的文本同时提供中文和英文；UI 文案放在 locale 表中。
- 破坏性操作必须有明确确认和可恢复说明。

## English summary

Issues and pull requests are welcome. Run `npm test` before submitting a PR.
Do not include tokens, OAuth codes, client secrets or credential files in
issues, PRs, logs or screenshots. Report security issues through GitHub Security
Advisories rather than a public issue.
