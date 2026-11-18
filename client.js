/* eslint-disable */
/**
 * DSH DevTools browser half: a global DevTools panel in the main column plus
 * its sidebar launcher. All data comes from the owner-only
 * `POST /api/dsh-devtools` route in `host/plugin.js`; this module owns only
 * presentation and transient form state.
 */
window.__ModuleLoader__.load({
  id: '@lukema/dsh-devtools',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'dshDevtools'
    const PANEL_ID = 'dsh-devtools'
    // Browser-relative: a deployment served under a path prefix keeps the prefix.
    const API_PATH = 'api/dsh-devtools'

    // ── copy ────────────────────────────────────────────────────────────────

    const en = {
      'panel.title': 'DevTools',
      'title': 'DSH DevTools',
      'subtitle': 'Connect your development tools to DeepSeek Harness.',
      'badge.integrations': '{n} integrations',
      'tab.integrations': 'Integrations',
      'tab.tools': 'Tools',
      'tab.permissions': 'Permissions',
      'tab.activity': 'Activity',

      'integrations.title': 'Your integrations',
      'integrations.subtitle': 'Manage your connected development tools and their MCP capabilities.',
      'integrations.search': 'Search integrations…',
      'integrations.add': 'Add MCP server',
      'integrations.empty': 'No integrations match your search.',
      'reset.zone': 'Danger zone',
      'reset.zoneText': 'Remove every provider connection, stored credential, tool selection, permission and activity entry. OAuth grants are revoked where the provider supports it.',
      'reset.action': 'Reset DevTools data',
      'reset.title': 'Reset DevTools data?',
      'reset.body': 'This disconnects every provider, removes stored tokens and OAuth grants, tool selections, permissions and activity. Provider-side tokens are revoked where supported. This cannot be undone.',
      'reset.confirm': 'Reset everything',
      'reset.done': 'DevTools data removed.',
      'integrations.custom': 'Custom',
      'integrations.filter.all': 'All integrations',
      'integrations.filter.connected': 'Connected',
      'integrations.filter.disconnected': 'Not connected',
      'integrations.filter.error': 'Needs attention',

      'status.connected': 'Connected',
      'status.connecting': 'Connecting',
      'status.error': 'Error',
      'status.disconnected': 'Not connected',
      'status.needsAuth': 'Needs authentication',

      'action.signIn': 'Sign in',
      'action.useToken': 'Use an access token instead',
      'action.openBrowser': 'Open browser again',
      'action.copyLink': 'Copy link',
      'auth.oauth': 'OAuth',
      'auth.token': 'API token',
      'auth.local': 'Local MCP',
      'dialog.token.title': 'Connect {name} with a token',
      'dialog.token.intro': 'Paste a {label}. DSH stores it in the credential provider and sends it only to this MCP endpoint.',
      'dialog.github.guide': 'How to create a GitHub token',
      'dialog.github.step1': 'Open GitHub Settings → Developer settings → Personal access tokens.',
      'dialog.github.step2': 'Generate a new token (classic or fine-grained).',
      'dialog.github.step3': 'Select the scopes above, or only the permissions you need.',
      'dialog.github.step4': 'Copy the token and paste it here; GitHub shows it only once.',
      'dialog.github.step5': 'For organization SSO, authorize the token for that organization.',
      'dialog.github.open': 'Open GitHub token settings',
      'dialog.token.scopes': 'Recommended scopes',
      'dialog.token.create': 'Create a token',
      'oauth.title': 'Sign in to {name}',
      'oauth.intro': 'A browser tab opens {name} to approve access. DSH stores the resulting token in its credential provider; this page never sees it.',
      'oauth.start': 'Sign in with {name}',
      'oauth.preparing': 'Preparing authorization…',
      'oauth.ready': 'Ready to open the browser.',
      'oauth.readyHint': 'Click Sign in to open the browser consent page.',
      'oauth.waiting': 'Waiting for browser authorization…',
      'oauth.waitingHint': 'Complete the consent page in the browser tab. This dialog updates automatically.',
      'oauth.waitingBlockedHint': 'If the browser did not open, use Open browser again below.',
      'oauth.popupBlocked': 'The browser tab was blocked. Use the link below to continue.',
      'oauth.copy': 'Copy authorization link',
      'oauth.copied': 'Link copied.',
      'oauth.failed': 'Browser authorization failed.',
      'oauth.timeout': 'Authorization timed out. Close this dialog and try again.',
      'oauth.figmaNote': 'Temporary Figma remote connection: Figma currently rejects non-catalog clients, so DSH uses a compatibility identity. Writing to Figma may require a Full seat. Write tools are initially off in the recommended set; enable them in Tools when you need canvas changes.',
      'oauth.tokenFallback': 'Use an API token instead',
      'local.title': 'Connect {name} desktop MCP',
      'local.intro': 'The desktop MCP server runs inside the {name} desktop app and listens on this machine only.',
      'local.requirement': 'Requires a Dev or Full seat on a paid Figma plan. If the bottom toolbar has no Dev Mode toggle, the account lacks that seat.',
      'local.step1': 'Open the Figma desktop app and a Design file.',
      'local.step2': 'With nothing selected, press Shift+D or click the Dev Mode toggle at the bottom of the toolbar.',
      'local.step3': 'In the right sidebar Inspect panel, find MCP server and click Enable desktop MCP server.',
      'local.step4': 'Keep Figma open, then click Connect below.',
      'local.endpoint': 'Local endpoint',
      'local.connect': 'Connect to desktop MCP',
      'local.onlyApp': 'Starting the Figma app alone does not start the server. Open a Design file, switch to Dev Mode, and enable the desktop MCP server in the Inspect panel.',
      'local.check': 'If it still fails, run curl -i http://127.0.0.1:3845/mcp: any HTTP response means the server is running; “connection refused” means it is not enabled.',
      'local.agentHint': 'If Figma asks you to set up or choose an agent, you can skip it. DSH is the MCP client; only the desktop server needs to be running.',
      'local.catalogLimit': 'Some Figma versions only allow approved MCP clients. If the MCP panel lists only Claude/Cursor/VS Code and has no Desktop/Other/Manual option, DSH cannot use Figma’s official MCP server; use a community Figma MCP bridge or join Figma’s MCP catalog waitlist.',
      'local.learnMore': 'Figma MCP client catalog',
      'local.waitlist': 'Join the Figma MCP client waitlist',
      'local.docs': 'Figma desktop server guide',
      'local.noDevMode': 'Cannot find Dev Mode? Use the Figma desktop app (not the browser), open a Design file, update the app, and check that your plan has a Dev or Full seat. FigJam and Slides do not have this MCP server.',
      'local.note': 'The desktop server does not support writing to the canvas or sending UI to Figma.',
      'local.failed': 'Figma desktop MCP is not reachable. Enable it in the Figma desktop app and keep the app open.',
      'toast.signedIn': '{name} authorized.',
      'action.manage': 'Manage',
      'action.connect': 'Connect',
      'action.disconnect': 'Disconnect',
      'action.reconnect': 'Reconnect',
      'action.test': 'Test connection',
      'action.remove': 'Remove',

      'detail.back': 'Back to integrations',
      'detail.overview': 'Overview',
      'detail.tools': 'Tools',
      'detail.permissions': 'Permissions',
      'detail.activity': 'Activity',
      'detail.connection': 'Connection status',
      'detail.account': 'Account',
      'detail.authentication': 'Authentication',
      'detail.lastChecked': 'Last checked',
      'detail.capabilities': 'Capabilities',
      'detail.capabilities.empty': 'No tools discovered yet.',
      'detail.permissionSettings': 'Permission settings',
      'detail.requireApproval': 'Require approval for writes',
      'detail.requireApprovalDesc': 'Confirm before creating issues, pull requests or pushing code.',
      'auth.bearer': 'Bearer token',
      'auth.none': 'None',
      'auth.noneHint': 'Connect with a token to authenticate.',
      'detail.noTools': 'No tools discovered. Reconnect and try again.',
      'detail.toolCount': '{n} tools',
      'detail.enabledCount': '{n} enabled',
      'detail.never': 'Never',
      'detail.endpoint': 'Endpoint',
      'detail.localAccount': '{name} desktop',

      'time.justNow': 'just now',
      'time.seconds': '{n}s ago',
      'time.minutes': '{n}m ago',
      'time.hours': '{n}h ago',
      'time.days': '{n}d ago',

      'tools.subtitle': 'Every MCP tool discovered from your connected providers.',
      'tools.filter.all': 'All levels',
      'tools.filter.read': 'Read',
      'tools.filter.write': 'Write',
      'tools.filter.dangerous': 'Dangerous',
      'tools.enableAll': 'Enable all',
      'tools.disableAll': 'Disable all',
      'tools.selectProvider': 'Select provider',
      'tools.search': 'Search tools…',
      'tools.count': '{n} tools available',
      'tools.policy.recommended': 'Recommended set',
      'tools.policy.enableAll': 'Enable all',
      'tools.policy.disableAll': 'Disable all',
      'tools.policy.useRecommended': 'Use recommended',
      'tools.policy.refreshRecommended': 'Refresh recommended',
      'tools.used': 'used {n}×',
      'tools.policy.summary': '{enabled} of {total} tools enabled · ≈{tokens} tokens',
      'tools.policy.note': 'Large catalogs start with a small read-first set. Once there is call history, frequently used tools are preferred; refresh to recompute.',
      'tools.policy.allNote': 'All tools are enabled. This catalog adds about {tokens} tokens to every request.',
      'tools.enableAll.title': 'Enable all {n} tools?',
      'tools.enableAll.body': 'This adds about {tokens} tokens to every request. Only enable the full catalog when you really need it.',
      'tools.enableAll.confirm': 'Enable all',
      'tools.policy.agentHint': 'The agent can search hidden tools with devtools_search_tools and enable one with devtools_enable_tool.',
      'tools.policy.disabled': 'All tools are disabled; the agent cannot see this provider.',
      'tools.policy.pending': 'Choosing a small recommended tool set…',
      'tools.policy.resetDone': 'Recommended set refreshed from your usage.',
      'tools.countEnabled': '{n} of {total} enabled',
      'tools.viewDetails': 'View details',
      'tools.column.tool': 'Tool',
      'tools.column.description': 'Description',
      'tools.column.status': 'Status',
      'tools.empty': 'No tools discovered yet. Connect an integration to load its tools.',
      'tools.emptySearch': 'No tools match your search.',
      'tools.notConnected': 'Connect this integration to load its tools.',
      'tools.enabled': 'Enabled',
      'tools.disabled': 'Disabled',

      'permissions.title': 'Permissions',
      'permissions.subtitle': 'Decide what the agent may run without asking. The plugin enforces every policy at call time, not only in this view.',
      'permissions.profile': 'Tool profile',
      'permissions.profile.read-only': 'Read only',
      'permissions.profile.read-only.desc': 'Every write and destructive call is blocked.',
      'permissions.profile.standard': 'Standard',
      'permissions.profile.standard.desc': 'Reads run freely, writes ask first, destructive calls are blocked.',
      'permissions.profile.unattended': 'Unattended',
      'permissions.profile.unattended.desc': 'Reads and writes run freely, destructive calls ask first.',
      'permissions.apply': 'Apply',
      'permissions.applied': 'Profile applied.',
      'permissions.policy': 'Policy',
      'permissions.policy.auto': 'Allow automatically',
      'permissions.policy.ask': 'Ask before running',
      'permissions.policy.block': 'Block',
      'permissions.level': 'Level',
      'permissions.level.read': 'Read',
      'permissions.level.write': 'Write',
      'permissions.level.dangerous': 'Dangerous',
      'permissions.empty': 'No governed tools yet. Connect an integration first.',
      'permissions.note': 'Policy changes apply to the next call. Disabled tools never reach the agent.',
      'permissions.search': 'Search tools…',
      'permissions.allProviders': 'All providers',
      'permissions.change': 'Change policy for {name}',

      'activity.title': 'Recent activity',
      'activity.subtitle': 'Your tools usage and important events.',
      'activity.range.24h': 'Last 24 hours',
      'activity.range.7d': 'Last 7 days',
      'activity.range.all': 'All time',
      'activity.clear': 'Clear history',
      'activity.confirmClear': 'Clear all recorded calls?',
      'activity.empty': 'No tool calls recorded yet.',
      'activity.success': 'Success',
      'activity.info': 'Info',
      'activity.error': 'Error',
      'activity.source.agent': 'Agent',
      'activity.source.test': 'Test',
      'activity.args': 'Arguments',
      'activity.result': 'Result',
      'activity.details': 'Details',
      'activity.redacted': 'Sensitive values are redacted before they are stored.',
      'activity.filter.provider': 'All providers',
      'activity.filter.status': 'All statuses',
      'activity.filter.success': 'Success',
      'activity.filter.error': 'Error',
      'toast.bulk': 'Tool states saved.',

      'dialog.connect.title': 'Connect {name}',
      'dialog.connect.intro': 'Use an access token for this MCP endpoint. DSH stores it in the credential provider; this page never reads it back.',
      'dialog.connect.token': 'Access token',
      'dialog.connect.tokenPlaceholder': 'Paste token',
      'dialog.connect.tokenKeep': 'Leave blank to keep the stored token.',
      'dialog.connect.endpoint': 'MCP endpoint',
      'dialog.connect.endpointHint': 'Streamable HTTP endpoint. Change it only when your organization hosts its own server.',
      'dialog.connect.advanced': 'Advanced options',
      'dialog.connect.submit': 'Connect',
      'dialog.connect.connecting': 'Connecting…',
      'dialog.connect.oauthNote': 'This build supports token authentication. Servers that only offer OAuth report a connection error until you issue a token.',
      'dialog.add.title': 'Add MCP server',
      'dialog.add.name': 'Name',
      'dialog.add.namePlaceholder': 'My MCP server',
      'dialog.add.url': 'Endpoint',
      'dialog.add.urlPlaceholder': 'https://example.com/mcp',
      'dialog.add.token': 'Access token (optional)',
      'dialog.add.submit': 'Add server',
      'dialog.disconnect.title': 'Disconnect {name}?',
      'dialog.disconnect.body': 'The agent loses these tools immediately. The stored token stays in DSH credentials.',
      'dialog.disconnect.oauthBody': 'The agent loses these tools immediately. The OAuth session stays in DSH credentials so you can reconnect without signing in again; Reset DevTools data removes it.',
      'dialog.remove.title': 'Remove {name}?',
      'dialog.remove.body': 'This removes the custom server and its saved settings.',
      'dialog.test.title': 'Test connection',
      'dialog.test.running': 'Probing the MCP endpoint…',
      'dialog.test.ok': 'Connected. {n} tools discovered.',
      'dialog.test.fail': 'Connection failed.',
      'dialog.test.duration': '{n} ms',

      'tool.title': 'Tool details',
      'tool.provider': 'Provider',
      'tool.description': 'Description',
      'tool.schema': 'Input schema',
      'tool.noParams': 'This tool takes no parameters.',
      'tool.param.name': 'Name',
      'tool.param.type': 'Type',
      'tool.param.required': 'Required',
      'tool.param.description': 'Description',
      'tool.test': 'Test call',
      'tool.testHint': 'This runs a real tool call through the same pipeline the agent uses. Arguments are recorded redacted in Activity.',
      'tool.run': 'Run',
      'tool.running': 'Running…',
      'tool.result': 'Result',
      'tool.result.ok': 'Succeeded in {n} ms',
      'tool.result.error': 'Failed',
      'tool.copy': 'Copy',
      'tool.copied': 'Copied',
      'tool.invalidJson': 'Enter valid JSON for “{name}”.',
      'tool.missingRequired': '“{name}” is required.',
      'tool.disabledWarning': 'This tool is disabled for the agent. The test call still runs.',
      'tool.policy': 'Policy',
      'tool.enabled': 'Enabled for agent',
      'tool.notIce': 'Only the in-page tester can call a blocked tool. The agent cannot.',

      'common.close': 'Close',
      'common.cancel': 'Cancel',
      'common.retry': 'Retry',
      'common.loading': 'Loading…',
      'common.none': 'None',
      'common.search': 'Search',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.required': 'required',

      'error.load': 'Could not load DevTools state.',
      'error.panel.title': 'This section could not be displayed.',
      'error.action': 'That action failed.',
      'toast.connected': '{name} connection started.',
      'toast.disconnected': '{name} disconnected.',
      'toast.removed': 'Server removed.',
      'toast.copied': 'Copied to clipboard.',
      'toast.cleared': 'Activity cleared.',
      'toast.toolEnabled': 'Tool enabled.',
      'toast.toolDisabled': 'Tool disabled.',
      'toast.policy': 'Policy saved.',
      'toast.approval': 'Approval setting saved.',
      'toast.added': 'Server added.',
    }

    const zh = {
      'panel.title': '开发工具',
      'title': 'DSH DevTools',
      'subtitle': '把开发工具接入 DeepSeek Harness。',
      'badge.integrations': '{n} 个集成',
      'tab.integrations': '集成',
      'tab.tools': '工具',
      'tab.permissions': '权限',
      'tab.activity': '活动',

      'integrations.title': '你的集成',
      'integrations.subtitle': '管理已连接的开发工具及其 MCP 能力。',
      'integrations.search': '搜索集成…',
      'integrations.add': '添加 MCP 服务器',
      'integrations.empty': '没有匹配的集成。',
      'reset.zone': '危险操作',
      'reset.zoneText': '删除所有 provider 连接、已保存的凭据、工具选择、权限和活动记录；支持撤销的 OAuth 授权会一并撤销。',
      'reset.action': '重置 DevTools 数据',
      'reset.title': '重置 DevTools 数据？',
      'reset.body': '这会断开所有 provider，删除已保存的 Token、OAuth 授权、工具选择、权限和活动记录；支持撤销的服务商会同时撤销授权。此操作不可恢复。',
      'reset.confirm': '全部重置',
      'reset.done': 'DevTools 数据已清除。',
      'integrations.custom': '自定义',
      'integrations.filter.all': '全部集成',
      'integrations.filter.connected': '已连接',
      'integrations.filter.disconnected': '未连接',
      'integrations.filter.error': '需要处理',

      'status.connected': '已连接',
      'status.connecting': '连接中',
      'status.error': '错误',
      'status.disconnected': '未连接',
      'status.needsAuth': '需要认证',

      'action.signIn': '登录',
      'action.useToken': '改用访问 Token',
      'action.openBrowser': '重新打开浏览器',
      'action.copyLink': '复制链接',
      'auth.oauth': 'OAuth',
      'auth.token': 'API Token',
      'auth.local': '本地 MCP',
      'dialog.token.title': '使用 Token 连接 {name}',
      'dialog.token.intro': '粘贴 {label}。DSH 会把它存入凭据提供方，并且只发送给这个 MCP 端点。',
      'dialog.github.guide': '如何创建 GitHub Token',
      'dialog.github.step1': '打开 GitHub Settings → Developer settings → Personal access tokens。',
      'dialog.github.step2': '生成新 Token（classic 或 fine-grained）。',
      'dialog.github.step3': '勾选上面的权限，或者只勾选你实际需要的权限。',
      'dialog.github.step4': '复制 Token 并粘贴到这里；GitHub 只显示一次。',
      'dialog.github.step5': '如果组织启用了 SSO，还需要为该组织授权 Token。',
      'dialog.github.open': '打开 GitHub Token 设置',
      'dialog.token.scopes': '推荐权限',
      'dialog.token.create': '创建 Token',
      'oauth.title': '登录 {name}',
      'oauth.intro': '浏览器会打开 {name} 的授权页面。DSH 会把拿到的 Token 存入凭据提供方，本页面不会接触它。',
      'oauth.start': '使用 {name} 登录',
      'oauth.preparing': '正在准备授权…',
      'oauth.ready': '已准备好打开浏览器。',
      'oauth.readyHint': '点击“使用 {name} 登录”打开浏览器授权页。',
      'oauth.waiting': '等待浏览器授权…',
      'oauth.waitingHint': '请在浏览器标签页完成授权，此对话框会自动更新。',
      'oauth.waitingBlockedHint': '如果浏览器没有打开，请点下方“重新打开浏览器”。',
      'oauth.popupBlocked': '浏览器标签页被拦截，请使用下面的链接继续。',
      'oauth.copy': '复制授权链接',
      'oauth.copied': '链接已复制。',
      'oauth.failed': '浏览器授权失败。',
      'oauth.timeout': '授权超时，请关闭对话框后重试。',
      'oauth.figmaNote': '临时的 Figma 远程连接：Figma 目前会拒绝非 catalog 客户端，DSH 使用了兼容身份。写入 Figma 可能需要 Full 席位；推荐集默认只启用只读工具，需要改画布时请在 Tools 中开启写工具。',
      'oauth.tokenFallback': '改用 API Token',
      'local.title': '连接 {name} 桌面 MCP',
      'local.intro': '{name} 桌面 MCP 运行在桌面应用中，只监听本机。',
      'local.requirement': '需要付费 Figma 计划中的 Dev 或 Full 席位。如果工具栏底部没有 Dev Mode 开关，说明当前账号没有该席位。',
      'local.step1': '打开 Figma 桌面应用并打开一个 Design 文件。',
      'local.step2': '不选中任何对象，按 Shift+D，或点击工具栏底部的 Dev Mode 开关。',
      'local.step3': '在右侧 Inspect 面板找到 MCP server，点击 Enable desktop MCP server。',
      'local.step4': '保持 Figma 打开，然后点击下方“连接”。',
      'local.endpoint': '本地端点',
      'local.connect': '连接桌面 MCP',
      'local.onlyApp': '仅启动 Figma 客户端不会启动 MCP server。需要打开 Design 文件、进入 Dev Mode，并在右侧 Inspect 面板中启用 desktop MCP server。',
      'local.check': '如果仍然失败，在终端运行 curl -i http://127.0.0.1:3845/mcp：返回任意 HTTP 状态码说明服务已启动；connection refused 说明还没有启用。',
      'local.agentHint': '如果 Figma 让你设置或选择 agent，可以跳过。DSH 本身就是 MCP 客户端，只需要 desktop server 处于运行状态。',
      'local.catalogLimit': '部分 Figma 版本只允许官方 MCP 目录中的客户端。如果 MCP 面板只列出 Claude/Cursor/VS Code，没有 Desktop/Other/Manual 选项，说明 DSH 无法使用 Figma 官方 MCP；请改用社区 Figma MCP bridge，或申请加入 Figma 的 MCP catalog。',
      'local.learnMore': 'Figma MCP 客户端目录',
      'local.waitlist': '申请加入 Figma MCP 客户端 waitlist',
      'local.docs': 'Figma 桌面服务配置文档',
      'local.noDevMode': '找不到 Dev Mode？请确认使用的是 Figma 桌面应用（不是浏览器）、打开的是 Design 文件、应用已更新，并且账号有 Dev 或 Full 席位。FigJam 和 Slides 没有这个 MCP server。',
      'local.note': '桌面服务器不支持写画布或把 UI 发送到 Figma。',
      'local.failed': '无法连接 Figma 桌面 MCP。请在 Figma 桌面应用中启用并保持打开。',
      'toast.signedIn': '{name} 已授权。',
      'action.manage': '管理',
      'action.connect': '连接',
      'action.disconnect': '断开连接',
      'action.reconnect': '重新连接',
      'action.test': '测试连接',
      'action.remove': '移除',

      'detail.back': '返回集成列表',
      'detail.overview': '概览',
      'detail.tools': '工具',
      'detail.permissions': '权限',
      'detail.activity': '活动',
      'detail.connection': '连接状态',
      'detail.account': '账号',
      'detail.authentication': '认证方式',
      'detail.lastChecked': '上次检查',
      'detail.capabilities': '能力',
      'detail.capabilities.empty': '尚未发现工具。',
      'detail.permissionSettings': '权限设置',
      'detail.requireApproval': '写入操作需要确认',
      'detail.requireApprovalDesc': '创建 Issue、PR 或推送代码前先确认。',
      'auth.bearer': 'Bearer Token',
      'auth.none': '无',
      'auth.noneHint': '使用 Token 进行认证。',
      'detail.noTools': '尚未发现工具，请重新连接后再试。',
      'detail.toolCount': '{n} 个工具',
      'detail.enabledCount': '已启用 {n} 个',
      'detail.never': '从未',
      'detail.endpoint': '端点',
      'detail.localAccount': '{name} 桌面端',

      'time.justNow': '刚刚',
      'time.seconds': '{n} 秒前',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',

      'tools.subtitle': '来自所有已连接提供方的 MCP 工具。',
      'tools.filter.all': '全部等级',
      'tools.filter.read': '读取',
      'tools.filter.write': '写入',
      'tools.filter.dangerous': '危险',
      'tools.enableAll': '全部启用',
      'tools.disableAll': '全部禁用',
      'tools.selectProvider': '选择提供方',
      'tools.search': '搜索工具…',
      'tools.count': '{n} 个工具可用',
      'tools.policy.recommended': '推荐工具集',
      'tools.policy.enableAll': '启用全部',
      'tools.policy.disableAll': '全部禁用',
      'tools.policy.useRecommended': '恢复推荐集',
      'tools.policy.refreshRecommended': '刷新推荐集',
      'tools.used': '使用 {n} 次',
      'tools.policy.summary': '已启用 {enabled}/{total} 个工具 · 约 {tokens} tokens',
      'tools.policy.note': '大型工具目录默认只启用少量只读工具；有调用记录后会优先保留高频工具，可点“刷新推荐集”重新计算。',
      'tools.policy.allNote': '已启用全部工具。该目录会让每次请求多出约 {tokens} tokens。',
      'tools.enableAll.title': '启用全部 {n} 个工具？',
      'tools.enableAll.body': '这会让每次请求多出约 {tokens} tokens。只有确实需要完整目录时才建议启用。',
      'tools.enableAll.confirm': '启用全部',
      'tools.policy.agentHint': 'agent 可以用 devtools_search_tools 搜索隐藏工具，并用 devtools_enable_tool 启用其中一个。',
      'tools.policy.disabled': '所有工具已禁用，agent 看不到这个 provider。',
      'tools.policy.pending': '正在选择推荐工具集…',
      'tools.policy.resetDone': '已根据使用记录刷新推荐集。',
      'tools.countEnabled': '已启用 {n} / {total}',
      'tools.viewDetails': '查看详情',
      'tools.column.tool': '工具',
      'tools.column.description': '描述',
      'tools.column.status': '状态',
      'tools.empty': '尚未发现工具。连接一个集成以加载工具。',
      'tools.emptySearch': '没有匹配的工具。',
      'tools.notConnected': '连接该集成以加载工具。',
      'tools.enabled': '已启用',
      'tools.disabled': '已禁用',

      'permissions.title': '权限',
      'permissions.subtitle': '决定 Agent 可以不询问就执行哪些操作。插件会在调用时实际执行每条策略，而不只是在界面上展示。',
      'permissions.profile': '工具预设',
      'permissions.profile.read-only': '只读',
      'permissions.profile.read-only.desc': '所有写入和破坏性调用都被拦截。',
      'permissions.profile.standard': '标准',
      'permissions.profile.standard.desc': '读取直接放行，写入需要确认，破坏性调用被拦截。',
      'permissions.profile.unattended': '无人值守',
      'permissions.profile.unattended.desc': '读写直接放行，破坏性调用需要确认。',
      'permissions.apply': '应用',
      'permissions.applied': '预设已应用。',
      'permissions.policy': '策略',
      'permissions.policy.auto': '自动允许',
      'permissions.policy.ask': '执行前确认',
      'permissions.policy.block': '禁止',
      'permissions.level': '等级',
      'permissions.level.read': '读取',
      'permissions.level.write': '写入',
      'permissions.level.dangerous': '危险',
      'permissions.empty': '暂无需要管控的工具。请先连接一个集成。',
      'permissions.note': '策略变更从下一次调用开始生效。被禁用的工具永远不会到达 Agent。',
      'permissions.search': '搜索工具…',
      'permissions.allProviders': '全部提供方',
      'permissions.change': '修改 {name} 的策略',

      'activity.title': '最近活动',
      'activity.subtitle': '工具使用情况和重要事件。',
      'activity.range.24h': '最近 24 小时',
      'activity.range.7d': '最近 7 天',
      'activity.range.all': '全部时间',
      'activity.clear': '清空记录',
      'activity.confirmClear': '清空所有已记录的调用？',
      'activity.empty': '还没有工具调用记录。',
      'activity.success': '成功',
      'activity.info': '信息',
      'activity.error': '错误',
      'activity.source.agent': 'Agent',
      'activity.source.test': '测试',
      'activity.args': '参数',
      'activity.result': '结果',
      'activity.details': '详情',
      'activity.redacted': '敏感信息在存储前会被脱敏。',
      'activity.filter.provider': '全部提供方',
      'activity.filter.status': '全部状态',
      'activity.filter.success': '成功',
      'activity.filter.error': '错误',
      'toast.bulk': '工具状态已保存。',

      'dialog.connect.title': '连接 {name}',
      'dialog.connect.intro': '为该 MCP 端点提供访问 Token。DSH 会把它存入凭据提供方，本页面不会读取回来。',
      'dialog.connect.token': '访问 Token',
      'dialog.connect.tokenPlaceholder': '粘贴 Token',
      'dialog.connect.tokenKeep': '留空则沿用已保存的 Token。',
      'dialog.connect.endpoint': 'MCP 端点',
      'dialog.connect.endpointHint': 'Streamable HTTP 端点。仅当组织自建服务器时才需要修改。',
      'dialog.connect.advanced': '高级选项',
      'dialog.connect.submit': '连接',
      'dialog.connect.connecting': '连接中…',
      'dialog.connect.oauthNote': '当前版本支持 Token 认证。仅提供 OAuth 的服务器会显示连接错误，直到你签发 Token。',
      'dialog.add.title': '添加 MCP 服务器',
      'dialog.add.name': '名称',
      'dialog.add.namePlaceholder': '我的 MCP 服务器',
      'dialog.add.url': '端点',
      'dialog.add.urlPlaceholder': 'https://example.com/mcp',
      'dialog.add.token': '访问 Token（可选）',
      'dialog.add.submit': '添加服务器',
      'dialog.disconnect.title': '断开 {name}？',
      'dialog.disconnect.body': 'Agent 会立即失去这些工具。已保存的 Token 仍保留在 DSH 凭据中。',
      'dialog.disconnect.oauthBody': 'Agent 会立即失去这些工具。OAuth 会话仍保留在 DSH 凭据中，重新连接时无需再次登录；如需删除请使用“重置 DevTools 数据”。',
      'dialog.remove.title': '移除 {name}？',
      'dialog.remove.body': '这会移除自定义服务器及其保存的设置。',
      'dialog.test.title': '测试连接',
      'dialog.test.running': '正在探测 MCP 端点…',
      'dialog.test.ok': '已连接，发现 {n} 个工具。',
      'dialog.test.fail': '连接失败。',
      'dialog.test.duration': '{n} 毫秒',

      'tool.title': '工具详情',
      'tool.provider': '提供方',
      'tool.description': '描述',
      'tool.schema': '输入 Schema',
      'tool.noParams': '该工具不需要参数。',
      'tool.param.name': '名称',
      'tool.param.type': '类型',
      'tool.param.required': '必填',
      'tool.param.description': '描述',
      'tool.test': '测试调用',
      'tool.testHint': '这会通过与 Agent 相同的管道执行一次真实调用。参数会脱敏后记录到活动。',
      'tool.run': '运行',
      'tool.running': '运行中…',
      'tool.result': '结果',
      'tool.result.ok': '成功，耗时 {n} 毫秒',
      'tool.result.error': '失败',
      'tool.copy': '复制',
      'tool.copied': '已复制',
      'tool.invalidJson': '请为“{name}”输入合法的 JSON。',
      'tool.missingRequired': '“{name}”为必填项。',
      'tool.disabledWarning': '该工具对 Agent 已禁用，但测试调用仍可运行。',
      'tool.policy': '策略',
      'tool.enabled': '对 Agent 启用',
      'tool.notIce': '被禁止的工具只有本页测试器可以调用，Agent 无法调用。',

      'common.close': '关闭',
      'common.cancel': '取消',
      'common.retry': '重试',
      'common.loading': '加载中…',
      'common.none': '无',
      'common.search': '搜索',
      'common.yes': '是',
      'common.no': '否',
      'common.required': '必填',

      'error.load': '无法加载 DevTools 状态。',
      'error.panel.title': '这个区域暂时无法显示。',
      'error.action': '操作失败。',
      'toast.connected': '{name} 已开始连接。',
      'toast.disconnected': '{name} 已断开。',
      'toast.removed': '服务器已移除。',
      'toast.copied': '已复制到剪贴板。',
      'toast.cleared': '活动记录已清空。',
      'toast.toolEnabled': '工具已启用。',
      'toast.toolDisabled': '工具已禁用。',
      'toast.policy': '策略已保存。',
      'toast.approval': '审批设置已保存。',
      'toast.added': '服务器已添加。',
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /**
     * Interpolate `{name}` placeholders after translating.
     * @param {(key: string) => string} t bound translate
     * @param {string} key dictionary key
     * @param {Record<string, unknown>} [vars] values
     */
    function tr(t, key, vars) {
      const raw = t(key)
      if (vars === undefined) return raw
      return String(raw).replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
      ))
    }

    /** @param {number} n approximate token count @returns {string} compact label */
    function tokenText(n) {
      const value = Number(n) || 0
      if (value < 1000) return String(Math.round(value))
      return `${Math.round(value / 100) / 10}k`
    }

    /** @param {number} ms duration in milliseconds */
    function formatDuration(ms) {
      const value = Number(ms) || 0
      return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`
    }

    /**
     * @param {number | null} ts epoch milliseconds
     * @param {(key: string, vars?: Record<string, unknown>) => string} tx translate
     */
    function timeAgo(ts, tx) {
      if (typeof ts !== 'number' || !Number.isFinite(ts)) return tx('detail.never')
      const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000))
      if (seconds < 10) return tx('time.justNow')
      if (seconds < 60) return tx('time.seconds', { n: seconds })
      const minutes = Math.round(seconds / 60)
      if (minutes < 60) return tx('time.minutes', { n: minutes })
      const hours = Math.round(minutes / 60)
      if (hours < 24) return tx('time.hours', { n: hours })
      return tx('time.days', { n: Math.round(hours / 24) })
    }

    /** @param {string} value candidate */
    function providerInitial(value) {
      return String(value ?? '?').slice(0, 1).toUpperCase()
    }

    /** @param {unknown} schema JSON schema node */
    function schemaType(schema) {
      if (schema === null || typeof schema !== 'object') return 'any'
      if (Array.isArray(schema.enum)) return 'enum'
      if (Array.isArray(schema.oneOf)) return 'one of'
      if (Array.isArray(schema.type)) return schema.type.join(' | ')
      if (typeof schema.type === 'string') return schema.type
      if (schema.properties !== undefined) return 'object'
      if (schema.items !== undefined) return 'array'
      return 'any'
    }

    /** @param {unknown} schema JSON schema node */
    function schemaDescription(schema) {
      if (schema === null || typeof schema !== 'object') return ''
      return typeof schema.description === 'string' ? schema.description : ''
    }

    /** @param {string} status provider status */
    function statusKey(status) {
      if (status === 'connected') return 'status.connected'
      if (status === 'connecting') return 'status.connecting'
      if (status === 'error') return 'status.error'
      if (status === 'needs-auth') return 'status.needsAuth'
      return 'status.disconnected'
    }

    /** @param {string} classification */
    function levelKey(classification) {
      if (classification === 'dangerous') return 'permissions.level.dangerous'
      if (classification === 'write') return 'permissions.level.write'
      return 'permissions.level.read'
    }

    /** @param {string} policy */
    function policyKey(policy) {
      if (policy === 'block') return 'permissions.policy.block'
      if (policy === 'ask') return 'permissions.policy.ask'
      return 'permissions.policy.auto'
    }

    /**
     * POST one action to the host route.
     * @param {string} action action name
     * @param {Record<string, unknown>} body extra fields
     */
    async function call(action, body) {
      let response
      try {
        response = await fetch(API_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ...body }),
        })
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Network request failed')
      }
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error(`HTTP ${response.status}`)
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }
      return payload
    }

    /**
     * Build initial form values from a JSON schema object.
     * @param {Record<string, any>} schema
     */
    function initialArgs(schema) {
      /** @type {Record<string, any>} */
      const values = {}
      const properties = schema?.properties
      if (properties === null || typeof properties !== 'object') return values
      for (const [name, property] of Object.entries(properties)) {
        if (property === null || typeof property !== 'object') {
          values[name] = ''
          continue
        }
        if (Array.isArray(property.enum) && property.enum.length > 0) {
          values[name] = property.enum[0]
        } else if (property.type === 'boolean') {
          values[name] = false
        } else if (property.type === 'object' || property.type === 'array') {
          values[name] = ''
        } else {
          values[name] = ''
        }
      }
      return values
    }

    // ── icons ───────────────────────────────────────────────────────────────

    const S = (props) => h('svg', {
      viewBox: '0 0 24 24', width: props.size ?? 16, height: props.size ?? 16,
      fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      style: { display: 'block', flex: 'none' },
    }, props.children)

    const ChevronDown = (props) => S({ ...props, children: h('path', { d: 'M6 9l6 6 6-6' }) })
    const ArrowLeft = (props) => S({ ...props, children: h('path', { d: 'M19 12H5m6-6l-6 6 6 6' }) })
    const SearchIcon = (props) => S({ ...props, children: [h('circle', { key: 'c', cx: 11, cy: 11, r: 6.5 }), h('path', { key: 'l', d: 'M16 16l4.5 4.5' })] })
    const CheckIcon = (props) => S({ ...props, children: h('path', { d: 'M4 12.5l5 5L20 6.5' }) })
    const XIcon = (props) => S({ ...props, children: h('path', { d: 'M6 6l12 12M18 6L6 18' }) })
    const CopyIcon = (props) => S({ ...props, children: [
      h('rect', { key: 'a', x: 9, y: 9, width: 11, height: 11, rx: 2 }),
      h('path', { key: 'b', d: 'M5 15V5a2 2 0 0 1 2-2h10' }),
    ] })
    const PlusIcon = (props) => S({ ...props, children: h('path', { d: 'M12 5v14M5 12h14' }) })
    const ShieldIcon = (props) => S({ ...props, children: [
      h('path', { key: 'a', d: 'M12 3l7 3v5c0 4.4-2.8 7.6-7 10-4.2-2.4-7-5.6-7-10V6l7-3z' }),
      h('path', { key: 'b', d: 'M9 12l2 2 4-4' }),
    ] })
    const GridIcon = (props) => S({ ...props, children: [
      h('rect', { key: 'a', x: 4, y: 4, width: 6, height: 6, rx: 1.5 }),
      h('rect', { key: 'b', x: 14, y: 4, width: 6, height: 6, rx: 1.5 }),
      h('rect', { key: 'c', x: 4, y: 14, width: 6, height: 6, rx: 1.5 }),
      h('rect', { key: 'd', x: 14, y: 14, width: 6, height: 6, rx: 1.5 }),
    ] })
    const WrenchIcon = (props) => S({ ...props, children: h('path', { d: 'M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7V20h3.3l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-2.4 2-2.2z' }) })
    const ClockIcon = (props) => S({ ...props, children: [h('circle', { key: 'c', cx: 12, cy: 12, r: 8 }), h('path', { key: 'h', d: 'M12 8v4.5l3 1.8' })] })

    /** The purple cube used by the panel and the sidebar row. */
    function CubeMark({ size = 24 }) {
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', 'aria-hidden': true, style: { display: 'block' } }, [
        h('path', { key: 'a', d: 'M12 2.6l8.2 4.4v9.9L12 21.4 3.8 16.9V7L12 2.6z', fill: 'currentColor', opacity: 0.22 }),
        h('path', { key: 'b', d: 'M12 2.6l8.2 4.4L12 11.5 3.8 7 12 2.6z', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' }),
        h('path', { key: 'c', d: 'M3.8 7v9.9l8.2 4.5 8.2-4.5V7M12 11.5v9.9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' }),
      ])
    }

    function GithubMark({ size = 24 }) {
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor', 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M12 1.8a10.2 10.2 0 0 0-3.2 19.9c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5A10.2 10.2 0 0 0 12 1.8z' }),
      )
    }

    function FigmaMark({ size = 24 }) {
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } }, [
        h('path', { key: 'a', d: 'M8.4 2.5h3.6v6H8.4a3 3 0 0 1 0-6z', fill: '#F24E1E' }),
        h('path', { key: 'b', d: 'M12 2.5h3.6a3 3 0 0 1 0 6H12v-6z', fill: '#FF7262' }),
        h('path', { key: 'c', d: 'M12 8.6h3.6a3 3 0 0 1 0 6H12v-6z', fill: '#1ABCFE' }),
        h('path', { key: 'd', d: 'M8.4 8.6H12v6H8.4a3 3 0 0 1 0-6z', fill: '#A259FF' }),
        h('path', { key: 'e', d: 'M8.4 14.7H12v3.1a3 3 0 1 1-3.6-3.1z', fill: '#0ACF83' }),
      ])
    }

    function VercelMark({ size = 24 }) {
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor', 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M12 3.6L22.4 20H1.6L12 3.6z' }),
      )
    }

    function DigitalOceanMark({ size = 24 }) {
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: '#0080FF', 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M12.04 0C5.408-.02.005 5.37.005 11.992h4.638c0-4.923 4.882-8.731 10.064-6.855a6.95 6.95 0 0 1 4.147 4.148c1.889 5.177-1.924 10.055-6.84 10.064v-4.61H7.391v4.623h4.61V24c7.86 0 13.967-7.588 11.397-15.83-1.115-3.59-3.985-6.446-7.575-7.575A12.8 12.8 0 0 0 12.039 0zM7.39 19.362H3.828v3.564H7.39zm-3.563 0v-2.978H.85v2.978z' }),
      )
    }

    function NotionMark({ size = 24 }) {
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor', 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z' }),
      )
    }

    function LinearMark({ size = 24 }) {
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: '#5E6AD2', 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z' }),
      )
    }

    /** @param {{ id: string, name?: string, size?: number }} props */
    function ProviderMark({ id, name, size = 24 }) {
      if (id === 'github') return h(GithubMark, { size })
      if (id === 'figma') return h(FigmaMark, { size })
      if (id === 'vercel') return h(VercelMark, { size })
      if (id === 'digitalocean') return h(DigitalOceanMark, { size })
      if (id === 'notion') return h(NotionMark, { size })
      if (id === 'linear') return h(LinearMark, { size })
      return h('div', {
        style: {
          width: size, height: size, borderRadius: Math.max(6, size * 0.26),
          background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
          display: 'grid', placeItems: 'center',
          fontSize: Math.max(10, size * 0.42), fontWeight: 600,
          color: 'var(--dsw-alias-label-secondary)',
        },
        'aria-hidden': true,
      }, providerInitial(name ?? id))
    }

    // ── controls ────────────────────────────────────────────────────────────

    function Button({ children, onClick, variant = 'default', size = 'md', disabled, title, type = 'button' }) {
      const className = `dt-btn${variant === 'primary' ? ' dt-btn-primary' : ''}${variant === 'danger' ? ' dt-btn-danger' : ''}${size === 'sm' ? ' dt-btn-sm' : ''}`
      return h('button', { type, className, onClick, disabled, title }, children)
    }

    function IconButton({ children, onClick, label, disabled }) {
      return h('button', {
        type: 'button', className: 'dt-icon-btn', onClick, disabled,
        'aria-label': label, title: label,
      }, children)
    }

    function Toggle({ checked, onChange, label, disabled }) {
      return h('button', {
        type: 'button',
        className: 'dt-switch',
        role: 'switch',
        'aria-checked': checked === true,
        'aria-label': label,
        title: label,
        disabled,
        onClick: (event) => {
          event.stopPropagation()
          if (!disabled) onChange(!checked)
        },
      })
    }

    function StatusPill({ status, label }) {
      return h('span', { className: `dt-status dt-status-${status}` }, [
        h('span', { key: 'd', className: 'dt-status-dot' }),
        h('span', { key: 'l' }, label),
      ])
    }

    function LevelTag({ classification, label }) {
      return h('span', { className: `dt-level dt-level-${classification}` }, label)
    }

    function SearchInput({ value, onChange, placeholder }) {
      return h('label', { className: 'dt-search' }, [
        h(SearchIcon, { key: 'i', size: 15 }),
        h('input', {
          key: 'in',
          type: 'search',
          value,
          placeholder,
          'aria-label': placeholder,
          onChange: event => onChange(event.target.value),
        }),
      ])
    }

    function Tabs({ items, value, onChange, className = '' }) {
      return h('div', { className: `dt-tabs ${className}`, role: 'tablist' }, items.map(item => h('button', {
        key: item.id,
        type: 'button',
        role: 'tab',
        'aria-selected': value === item.id,
        className: 'dt-tab',
        onClick: () => onChange(item.id),
      }, [item.icon ? h('span', { key: 'i', className: 'dt-tab-icon' }, item.icon) : null, h('span', { key: 'l' }, item.label)])))
    }

    function Modal({ title, subtitle, label, onClose, children, footer, wide }) {
      const panel = useRef(null)
      const closeRef = useRef(onClose)
      closeRef.current = onClose
      useEffect(() => {
        const focusables = () => {
          if (panel.current === null) return []
          return [...panel.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')]
        }
        const onKey = (event) => {
          if (event.key === 'Escape') {
            closeRef.current()
            return
          }
          if (event.key !== 'Tab') return
          const items = focusables()
          if (items.length === 0) return
          const first = items[0]
          const last = items[items.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        document.addEventListener('keydown', onKey)
        const previous = document.activeElement
        if (panel.current !== null) {
          const field = panel.current.querySelector('input, textarea, select')
          const focusable = field ?? panel.current.querySelector('button')
          if (focusable !== null) focusable.focus()
        }
        return () => {
          document.removeEventListener('keydown', onKey)
          if (previous instanceof HTMLElement) previous.focus()
        }
      }, [])
      return h('div', { className: 'dt-backdrop', onMouseDown: event => { if (event.target === event.currentTarget) onClose() } },
        h('div', {
          className: `dt-modal${wide ? ' dt-modal-wide' : ''}`,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': label ?? (typeof title === 'string' ? title : undefined),
          ref: panel,
        }, [
          h('div', { key: 'head', className: 'dt-modal-head' }, [
            h('div', { key: 'text' }, [
              h('div', { key: 't', className: 'dt-modal-title' }, title),
              subtitle ? h('div', { key: 's', className: 'dt-modal-sub' }, subtitle) : null,
            ]),
            h(IconButton, { key: 'x', label: 'Close', onClick: onClose }, h(XIcon, { size: 16 })),
          ]),
          h('div', { key: 'body', className: 'dt-modal-body' }, children),
          footer ? h('div', { key: 'foot', className: 'dt-modal-foot' }, footer) : null,
        ]),
      )
    }

    function Notice({ notice }) {
      if (notice === null) return null
      return h('div', { className: `dt-notice dt-notice-${notice.kind}`, role: 'status' },
        h('span', null, notice.text))
    }

    function EmptyState({ title, body }) {
      return h('div', { className: 'dt-empty' }, [
        h('div', { key: 't', className: 'dt-empty-title' }, title),
        body ? h('div', { key: 'b', className: 'dt-empty-body' }, body) : null,
      ])
    }

    // ── Integrations ────────────────────────────────────────────────────────

    function IntegrationsPanel({ t, snapshot, onOpen, onConnect, onAdd, onReset }) {
      const [query, setQuery] = useState('')
      const [statusFilter, setStatusFilter] = useState('all')
      const providers = snapshot.providers.filter(provider => {
        if (statusFilter === 'connected' && provider.status !== 'connected' && provider.status !== 'connecting') return false
        if (statusFilter === 'disconnected' && provider.status !== 'disconnected') return false
        if (statusFilter === 'error' && provider.status !== 'error' && provider.status !== 'needs-auth') return false
        const needle = query.trim().toLowerCase()
        if (needle === '') return true
        return `${provider.name} ${provider.description}`.toLowerCase().includes(needle)
      })
      return h('section', { className: 'dt-section' }, [
        h('div', { key: 'head', className: 'dt-section-head' }, [
          h('div', { key: 'text' }, [
            h('h2', { key: 'h', className: 'dt-h2' }, t('integrations.title')),
            h('p', { key: 'p', className: 'dt-h2-sub' }, t('integrations.subtitle')),
          ]),
          h('div', { key: 'actions', className: 'dt-inline-actions' }, [
            h('label', { key: 'filter', className: 'dt-select-wrap' }, [
              h('span', { key: 'l', className: 'dt-visually-hidden' }, t('integrations.filter.all')),
              h('select', {
                key: 's',
                className: 'dt-select',
                value: statusFilter,
                onChange: event => setStatusFilter(event.target.value),
              }, ['all', 'connected', 'disconnected', 'error'].map(value => h('option', { key: value, value }, t(`integrations.filter.${value}`)))),
              h(ChevronDown, { key: 'i', size: 14 }),
            ]),
            h(SearchInput, {
              key: 'search',
              value: query,
              onChange: setQuery,
              placeholder: t('integrations.search'),
            }),
            h(Button, { key: 'add', onClick: onAdd }, [h(PlusIcon, { key: 'i', size: 15 }), t('integrations.add')]),
          ]),
        ]),
        providers.length === 0
          ? h(EmptyState, { key: 'empty', title: t('integrations.empty') })
          : h('div', { key: 'grid', className: 'dt-grid' }, providers.map(provider => h(ProviderCard, {
            key: provider.id,
            t,
            provider,
            onOpen: () => onOpen(provider.id),
            onConnect: () => onConnect(provider.id),
          }))),
        h('div', { key: 'danger', className: 'dt-danger-zone' }, [
          h('div', { key: 'text' }, [
            h('div', { key: 't', className: 'dt-danger-title' }, t('reset.zone')),
            h('p', { key: 'b', className: 'dt-danger-text' }, t('reset.zoneText')),
          ]),
          h(Button, { key: 'r', variant: 'danger', onClick: onReset }, t('reset.action')),
        ]),
      ])
    }

    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        console.error('dsh-devtools panel render failed', error, info)
      }

      render() {
        const t = this.props.t
        if (this.state.error !== null) {
          return h('div', { className: 'dt-panel dt-error-panel' }, [
            h('div', { key: 't', className: 'dt-error-title' }, t('error.panel.title')),
            h('div', { key: 'm', className: 'dt-error-text' }, String(this.state.error?.message ?? this.state.error)),
            h(Button, { key: 'r', onClick: () => this.setState({ error: null }) }, t('common.retry')),
          ])
        }
        return this.props.children
      }
    }

    function ProviderCard({ t, provider, onOpen, onConnect }) {
      const connected = provider.status === 'connected' || provider.status === 'connecting'
      const label = tr(t, statusKey(provider.status))
      const needsSignIn = provider.needsAuth === true || (provider.oauth === true && provider.hasCredential !== true)
      const action = needsSignIn ? t('action.signIn') : provider.enabled ? t('action.manage') : t('action.connect')
      const actionHandler = needsSignIn ? onConnect : provider.enabled ? onOpen : onConnect
      return h('div', { className: 'dt-card dt-provider-card' }, [
        h('button', {
          key: 'open',
          type: 'button',
          className: 'dt-card-open',
          onClick: onOpen,
          'aria-label': `${provider.name} — ${label}`,
        }, [
          h('span', { key: 'top', className: 'dt-card-top' }, [
            h('span', { key: 'mark', className: 'dt-card-mark' }, h(ProviderMark, { id: provider.id, name: provider.name, size: 28 })),
            h('span', { key: 'text', className: 'dt-card-text' }, [
              h('span', { key: 'name', className: 'dt-card-name' }, provider.name),
              h('span', { key: 'desc', className: 'dt-card-desc' }, provider.description),
            ]),
          ]),
          h('span', { key: 'meta', className: 'dt-card-meta' }, [
            h('span', { key: 'tools', className: 'dt-muted' }, provider.enabledToolCount !== provider.toolCount
              ? tr(t, 'tools.countEnabled', { n: provider.enabledToolCount, total: provider.toolCount })
              : tr(t, 'detail.toolCount', { n: provider.toolCount })),
            provider.kind === 'custom' ? h('span', { key: 'custom', className: 'dt-chip' }, t('integrations.custom')) : null,
          ]),
        ]),
        h('div', { key: 'foot', className: 'dt-card-foot' }, [
          h('span', {
            key: 'status',
            className: `dt-status dt-status-${provider.status}`,
            title: provider.statusDetail ?? undefined,
          }, [
            h('span', { key: 'dot', className: 'dt-status-dot' }),
            h('span', { key: 'label' }, label),
          ]),
          h('button', {
            key: 'action',
            type: 'button',
            className: 'dt-card-action',
            onClick: actionHandler,
          }, [action, h('span', { key: 'a', className: 'dt-arrow' }, '→')]),
        ]),
      ])
    }

    // ── Provider detail ─────────────────────────────────────────────────────

    function ProviderDetail({ t, snapshot, provider, initialTab, onBack, onAction, onTool, onConnect, onConfirm }) {
      const [tab, setTab] = useState(initialTab ?? 'overview')
      const tools = snapshot.tools.filter(tool => tool.providerId === provider.id)
      const activity = snapshot.activity.filter(entry => entry.providerId === provider.id)
      const tabs = [
        { id: 'overview', label: t('detail.overview'), icon: h(GridIcon, { size: 14 }) },
        { id: 'tools', label: t('detail.tools'), icon: h(WrenchIcon, { size: 14 }) },
        { id: 'permissions', label: t('detail.permissions'), icon: h(ShieldIcon, { size: 14 }) },
        { id: 'activity', label: t('detail.activity'), icon: h(ClockIcon, { size: 14 }) },
      ]
      const enabled = provider.enabled
      const needsSignIn = provider.needsAuth === true || (provider.oauth === true && provider.hasCredential !== true)
      return h('section', { className: 'dt-detail' }, [
        h('button', { key: 'back', type: 'button', className: 'dt-back', onClick: onBack }, [
          h(ArrowLeft, { key: 'i', size: 14 }),
          h('span', { key: 'l' }, t('detail.back')),
        ]),
        h('div', { key: 'head', className: 'dt-detail-head' }, [
          h('div', { key: 'brand', className: 'dt-detail-brand' }, [
            h('div', { key: 'mark', className: 'dt-detail-mark' }, h(ProviderMark, { id: provider.id, name: provider.name, size: 34 })),
            h('div', { key: 'text' }, [
              h('div', { key: 'name-row', className: 'dt-detail-name-row' }, [
                h('h2', { key: 'n', className: 'dt-detail-name' }, provider.name),
                h(StatusPill, { key: 's', status: provider.status, label: tr(t, statusKey(provider.status)) }),
              ]),
              h('p', { key: 'd', className: 'dt-detail-desc' }, provider.description),
            ]),
          ]),
          h('div', { key: 'actions', className: 'dt-inline-actions' }, [
            needsSignIn
              ? h(Button, { key: 'signin', variant: 'primary', onClick: () => onConnect(provider.id) }, t('action.signIn'))
              : enabled ? h(Button, { key: 'test', onClick: () => onAction('test', provider) }, t('action.test')) : h(Button, { key: 'connect', variant: 'primary', onClick: () => onConnect(provider.id) }, t('action.connect')),
            !needsSignIn && enabled ? h(Button, { key: 'reconnect', onClick: () => onAction('reconnect', provider) }, t('action.reconnect')) : null,
            enabled
              ? h(Button, { key: 'disconnect', variant: 'danger', onClick: () => onConfirm('disconnect', provider) }, t('action.disconnect'))
              : null,
            provider.kind === 'custom' ? h(Button, { key: 'remove', variant: 'danger', onClick: () => onConfirm('remove', provider) }, t('action.remove')) : null,
          ]),
        ]),
        h(Tabs, { key: 'tabs', items: tabs, value: tab, onChange: setTab }),
        h('div', { key: 'body', className: 'dt-detail-body' }, h(PanelBoundary, { key: tab, t },
          tab === 'overview' ? h(OverviewTab, { key: 'ov', t, provider, tools, onReconnect: () => onAction('reconnect', provider), onToggleApproval: value => onAction('approval', provider, value) }) : null,
          tab === 'tools' ? h(ProviderToolsTab, { key: 'tl', t, provider, tools, onTool, onToggle: (tool, value) => onAction('toolEnabled', tool, value), onMode: value => onAction('toolMode', provider, value) }) : null,
          tab === 'permissions' ? h(ProviderPermissionsTab, { key: 'pm', t, provider, tools, onPolicy: (tool, policy) => onAction('policy', tool, policy) }) : null,
          tab === 'activity' ? h(ActivityPanel, { key: 'ac', t, entries: activity, compact: true }) : null,
        )),
      ])
    }

    function OverviewTab({ t, provider, tools, onReconnect, onToggleApproval }) {
      const capabilities = provider.capabilities ?? []
      const authLabel = provider.authMode === 'oauth'
        ? t('auth.oauth')
        : provider.authMode === 'local' ? t('auth.local') : t('auth.token')
      return h('div', { className: 'dt-overview' }, [
        h('div', { key: 'left', className: 'dt-overview-main' }, [
          h('section', { key: 'conn', className: 'dt-panel' }, [
            h('div', { key: 'head', className: 'dt-panel-head' }, [
              h('h3', { key: 't', className: 'dt-panel-title' }, t('detail.connection')),
              provider.status !== 'connected' && provider.statusDetail !== null
                ? h('span', { key: 'detail', className: 'dt-panel-sub dt-error-text' }, provider.statusDetail)
                : null,
            ]),
            h('dl', { key: 'rows', className: 'dt-kv' }, [
              h('div', { key: 'account', className: 'dt-kv-row' }, [
                h('dt', { key: 'k' }, t('detail.account')),
                h('dd', { key: 'v' }, provider.account
                  ?? (provider.authMode === 'local'
                    ? tr(t, 'detail.localAccount', { name: provider.name })
                    : provider.hasCredential ? t('auth.token') : t('common.none'))),
              ]),
              h('div', { key: 'auth', className: 'dt-kv-row' }, [
                h('dt', { key: 'k' }, t('detail.authentication')),
                h('dd', { key: 'v' }, authLabel),
              ]),
              h('div', { key: 'checked', className: 'dt-kv-row' }, [
                h('dt', { key: 'k' }, t('detail.lastChecked')),
                h('dd', { key: 'v' }, timeAgo(provider.lastChecked, (key, vars) => tr(t, key, vars))),
              ]),
              h('div', { key: 'url', className: 'dt-kv-row' }, [
                h('dt', { key: 'k' }, t('detail.endpoint')),
                h('dd', { key: 'v', className: 'dt-mono dt-break' }, provider.url),
              ]),
            ]),
            h('div', { key: 'actions', className: 'dt-panel-actions' }, h(Button, {
              onClick: onReconnect,
              disabled: !provider.enabled,
            }, t('action.reconnect'))),
          ]),
          h('section', { key: 'perm', className: 'dt-panel dt-panel-row' }, [
            h('div', { key: 'icon', className: 'dt-panel-icon' }, h(ShieldIcon, { size: 18 })),
            h('div', { key: 'text', className: 'dt-grow' }, [
              h('div', { key: 't', className: 'dt-panel-title' }, t('detail.permissionSettings')),
              h('div', { key: 'h', className: 'dt-panel-strong' }, t('detail.requireApproval')),
              h('div', { key: 'd', className: 'dt-panel-sub' }, t('detail.requireApprovalDesc')),
            ]),
            h(Toggle, {
              key: 'toggle',
              checked: provider.requireApproval,
              onChange: onToggleApproval,
              label: t('detail.requireApproval'),
            }),
          ]),
        ]),
        h('div', { key: 'right', className: 'dt-overview-side' }, [
          h('section', { key: 'cap', className: 'dt-panel' }, [
            h('h3', { key: 't', className: 'dt-panel-title' }, t('detail.capabilities')),
            capabilities.length === 0
              ? h('p', { key: 'empty', className: 'dt-panel-sub' }, t('detail.capabilities.empty'))
              : h('ul', { key: 'list', className: 'dt-capabilities' }, capabilities.map(label => h('li', { key: label }, [
                h('span', { key: 'i', className: 'dt-cap-check' }, h(CheckIcon, { size: 12 })),
                h('span', { key: 'l' }, label),
              ]))),
            h('p', { key: 'count', className: 'dt-panel-sub' }, tr(t, 'detail.toolCount', { n: tools.length })),
          ]),
        ]),
      ])
    }

    // ── Tools ───────────────────────────────────────────────────────────────

    function ProviderToolsTab({ t, provider, tools, onTool, onToggle, onMode }) {
      const [query, setQuery] = useState('')
      const filtered = tools.filter(tool => {
        const needle = query.trim().toLowerCase()
        if (needle === '') return true
        return `${tool.rawName} ${tool.description}`.toLowerCase().includes(needle)
      })
      if (tools.length === 0) {
        return h(EmptyState, {
          title: provider.status === 'connected' ? t('detail.noTools') : t('tools.notConnected'),
        })
      }
      const enabled = tools.filter(tool => tool.enabled).length
      const tokens = tokenText(provider.enabledSchemaTokens ?? tools.filter(tool => tool.enabled).reduce((sum, tool) => sum + (tool.tokens ?? 0), 0))
      const policy = provider.toolPolicy ?? 'all'
      const note = policy === 'pending'
        ? t('tools.policy.pending')
        : enabled === 0
          ? t('tools.policy.disabled')
          : policy === 'recommended'
          ? t('tools.policy.note')
          : policy === 'all' && enabled === tools.length && tools.length > 30
            ? tr(t, 'tools.policy.allNote', { tokens })
            : null
      return h('div', { className: 'dt-stack' }, [
        h('div', { key: 'head', className: 'dt-toolbar dt-toolbar-wrap' }, [
          h(SearchInput, { key: 's', value: query, onChange: setQuery, placeholder: t('tools.search') }),
          h('span', { key: 'c', className: 'dt-muted' }, tr(t, 'tools.policy.summary', { enabled, total: tools.length, tokens })),
          h('div', { key: 'actions', className: 'dt-inline-actions' }, [
            tools.length > 30
              ? h(Button, {
                key: 'rec',
                size: 'sm',
                onClick: () => onMode('recommended'),
              }, policy === 'recommended' ? t('tools.policy.refreshRecommended') : t('tools.policy.useRecommended'))
              : null,
            policy !== 'all'
              ? h(Button, { key: 'all', size: 'sm', onClick: () => onMode('all') }, t('tools.policy.enableAll'))
              : h(Button, { key: 'none', size: 'sm', onClick: () => onMode('none') }, t('tools.policy.disableAll')),
          ]),
        ]),
        note !== null ? h('p', { key: 'note', className: 'dt-note' }, note) : null,
        tools.length > 30 ? h('p', { key: 'agent', className: 'dt-note' }, t('tools.policy.agentHint')) : null,
        h('div', { key: 'table', className: 'dt-table-wrap' }, h('table', { className: 'dt-table' }, [
          h('thead', { key: 'h' }, h('tr', null, [
            h('th', { key: 't' }, t('tools.column.tool')),
            h('th', { key: 'd' }, t('tools.column.description')),
            h('th', { key: 's', className: 'dt-col-status' }, t('tools.column.status')),
          ])),
          h('tbody', { key: 'b' }, filtered.length === 0
            ? h('tr', null, h('td', { colSpan: 3, className: 'dt-table-empty' }, t('tools.emptySearch')))
            : filtered.map(tool => h('tr', { key: tool.name }, [
              h('td', { key: 'n' }, h('button', {
                type: 'button', className: 'dt-tool-link', onClick: () => onTool(tool),
              }, h('span', { className: 'dt-mono' }, tool.rawName))),
              h('td', { key: 'd', className: 'dt-td-desc' }, [
                h('span', { key: 'd' }, tool.description),
                tool.usage > 0 ? h('span', { key: 'u', className: 'dt-muted' }, ` · ${tr(t, 'tools.used', { n: tool.usage })}`) : null,
              ]),
              h('td', { key: 's', className: 'dt-col-status' }, h('div', { className: 'dt-toggle-cell' }, [
                h('span', { key: 'l', className: 'dt-muted' }, tool.enabled ? t('tools.enabled') : t('tools.disabled')),
                h(Toggle, { key: 't', checked: tool.enabled, onChange: value => onToggle(tool, value), label: tool.rawName }),
              ])),
            ]))),
        ])),
      ])
    }

    function ProviderPermissionsTab({ t, provider, tools, onPolicy }) {
      if (tools.length === 0) {
        return h(EmptyState, { title: t('permissions.empty') })
      }
      const enabledCount = tools.filter(tool => tool.enabled).length
      return h('div', { className: 'dt-stack' }, [
        h('div', { key: 'head', className: 'dt-toolbar' }, [
          h('span', { key: 'c', className: 'dt-muted' }, tr(t, 'tools.countEnabled', { n: enabledCount, total: tools.length })),
        ]),
        h('div', { key: 'table', className: 'dt-table-wrap' }, h('table', { className: 'dt-table' }, [
          h('thead', { key: 'h' }, h('tr', null, [
            h('th', { key: 't' }, t('tools.column.tool')),
            h('th', { key: 'l' }, t('permissions.level')),
            h('th', { key: 'p' }, t('permissions.policy')),
          ])),
          h('tbody', { key: 'b' }, tools.map(tool => h('tr', { key: tool.name }, [
            h('td', { key: 't' }, h('span', { className: 'dt-mono' }, tool.rawName)),
            h('td', { key: 'l' }, h(LevelTag, { classification: tool.classification, label: t(levelKey(tool.classification)) })),
            h('td', { key: 'p' }, h('label', { className: 'dt-select-wrap dt-select-inline' }, [
              h('span', { key: 'l', className: 'dt-visually-hidden' }, tr(t, 'permissions.change', { name: tool.rawName })),
              h('select', {
                key: 's',
                className: 'dt-select',
                value: tool.policy,
                onChange: event => onPolicy(tool, event.target.value),
              }, ['auto', 'ask', 'block'].map(policy => h('option', { key: policy, value: policy }, t(policyKey(policy))))),
              h(ChevronDown, { key: 'i', size: 14 }),
            ])),
          ]))),
        ])),
        h('p', { key: 'note', className: 'dt-note' }, t('permissions.note')),
      ])
    }

    function ToolsPanel({ t, snapshot, onTool, onToggle, onViewProvider, onBulk }) {
      const providers = snapshot.providers.filter(provider => provider.toolCount > 0 || provider.enabled)
      const [selected, setSelected] = useState(null)
      const [query, setQuery] = useState('')
      const [levelFilter, setLevelFilter] = useState('all')
      const active = providers.find(provider => provider.id === selected)
        ?? providers.find(provider => provider.status === 'connected')
        ?? providers[0]
      if (active === undefined) {
        return h('section', { className: 'dt-section' }, [
          h('div', { key: 'head', className: 'dt-section-head' }, h('div', { key: 't' }, [
            h('h2', { key: 'h', className: 'dt-h2' }, t('tab.tools')),
            h('p', { key: 'p', className: 'dt-h2-sub' }, t('integrations.subtitle')),
          ])),
          h(EmptyState, { key: 'empty', title: t('tools.empty') }),
        ])
      }
      const tools = snapshot.tools.filter(tool => tool.providerId === active.id)
      const filtered = tools.filter(tool => {
        if (levelFilter !== 'all' && tool.classification !== levelFilter) return false
        const needle = query.trim().toLowerCase()
        if (needle === '') return true
        return `${tool.rawName} ${tool.description}`.toLowerCase().includes(needle)
      })
      return h('section', { className: 'dt-section' }, [
        h('div', { key: 'head', className: 'dt-section-head' }, h('div', { key: 't' }, [
          h('h2', { key: 'h', className: 'dt-h2' }, t('tab.tools')),
          h('p', { key: 'p', className: 'dt-h2-sub' }, t('tools.subtitle')),
        ])),
        h('div', { key: 'layout', className: 'dt-tools-layout' }, [
          h('aside', { key: 'side', className: 'dt-provider-list', 'aria-label': t('tools.selectProvider') }, [
            h('div', { key: 'label', className: 'dt-provider-list-label' }, t('tools.selectProvider')),
            ...providers.map(provider => h('button', {
              key: provider.id,
              type: 'button',
              className: 'dt-provider-item',
              'aria-current': provider.id === active.id,
              onClick: () => setSelected(provider.id),
            }, [
              h('span', { key: 'm', className: 'dt-provider-item-mark' }, h(ProviderMark, { id: provider.id, name: provider.name, size: 18 })),
              h('span', { key: 'n', className: 'dt-grow dt-ellipsis' }, provider.name),
              h('span', { key: 'c', className: 'dt-muted' }, provider.toolCount),
            ])),
          ]),
          h('div', { key: 'main', className: 'dt-stack' }, [
            h('div', { key: 'head', className: 'dt-tool-head' }, [
              h('div', { key: 'brand', className: 'dt-tool-head-brand' }, [
                h('span', { key: 'm', className: 'dt-card-mark' }, h(ProviderMark, { id: active.id, name: active.name, size: 22 })),
                h('div', { key: 't' }, [
                  h('div', { key: 'n', className: 'dt-tool-head-name' }, active.name),
                  h('div', { key: 'c', className: 'dt-muted' }, tr(t, 'tools.count', { n: tools.length })),
                ]),
                h(StatusPill, { key: 's', status: active.status, label: tr(t, statusKey(active.status)) }),
              ]),
              h(Button, { key: 'view', size: 'sm', onClick: () => onViewProvider(active.id) }, [t('tools.viewDetails'), h('span', { key: 'a', className: 'dt-arrow' }, '→')]),
            ]),
            h('div', { key: 'toolbar', className: 'dt-toolbar dt-toolbar-wrap' }, [
              h(SearchInput, { key: 's', value: query, onChange: setQuery, placeholder: t('tools.search') }),
              h('div', { key: 'filters', className: 'dt-inline-actions' }, [
                h('label', { key: 'level', className: 'dt-select-wrap' }, [
                  h('span', { key: 'l', className: 'dt-visually-hidden' }, t('tools.filter.all')),
                  h('select', {
                    key: 's',
                    className: 'dt-select',
                    value: levelFilter,
                    onChange: event => setLevelFilter(event.target.value),
                  }, ['all', 'read', 'write', 'dangerous'].map(value => h('option', { key: value, value }, t(`tools.filter.${value}`)))),
                  h(ChevronDown, { key: 'i', size: 14 }),
                ]),
                h(Button, { key: 'enable', size: 'sm', onClick: () => onBulk(active.id, true) }, t('tools.enableAll')),
                h(Button, { key: 'disable', size: 'sm', onClick: () => onBulk(active.id, false) }, t('tools.disableAll')),
              ]),
              h('span', { key: 'c', className: 'dt-muted' }, tr(t, 'tools.countEnabled', { n: tools.filter(tool => tool.enabled).length, total: tools.length })),
            ]),
            h('div', { key: 'table', className: 'dt-table-wrap' }, h('table', { className: 'dt-table' }, [
              h('thead', { key: 'h' }, h('tr', null, [
                h('th', { key: 't' }, t('tools.column.tool')),
                h('th', { key: 'd' }, t('tools.column.description')),
                h('th', { key: 's', className: 'dt-col-status' }, t('tools.column.status')),
              ])),
              h('tbody', { key: 'b' }, filtered.length === 0
                ? h('tr', null, h('td', { colSpan: 3, className: 'dt-table-empty' }, tools.length === 0 ? t('tools.empty') : t('tools.emptySearch')))
                : filtered.map(tool => h('tr', { key: tool.name }, [
                  h('td', { key: 'n' }, h('button', { type: 'button', className: 'dt-tool-link', onClick: () => onTool(tool) }, h('span', { className: 'dt-mono' }, tool.rawName))),
                  h('td', { key: 'd', className: 'dt-td-desc' }, [
                h('span', { key: 'd' }, tool.description),
                tool.usage > 0 ? h('span', { key: 'u', className: 'dt-muted' }, ` · ${tr(t, 'tools.used', { n: tool.usage })}`) : null,
              ]),
                  h('td', { key: 's', className: 'dt-col-status' }, h('div', { className: 'dt-toggle-cell' }, [
                    h('span', { key: 'l', className: 'dt-muted' }, tool.enabled ? t('tools.enabled') : t('tools.disabled')),
                    h(Toggle, { key: 't', checked: tool.enabled, onChange: value => onToggle(tool, value), label: tool.rawName }),
                  ])),
                ]))),
              ])),
          ]),
        ]),
      ])
    }

    // ── Permissions ─────────────────────────────────────────────────────────

    function PermissionsPanel({ t, snapshot, onPolicy, onProfile }) {
      const [providerId, setProviderId] = useState('all')
      const [query, setQuery] = useState('')
      const [applying, setApplying] = useState(null)
      const filtered = snapshot.tools.filter(tool => {
        if (providerId !== 'all' && tool.providerId !== providerId) return false
        const needle = query.trim().toLowerCase()
        if (needle === '') return true
        return `${tool.rawName} ${tool.description} ${tool.providerName}`.toLowerCase().includes(needle)
      })
      const profiles = [
        { id: 'read-only', title: t('permissions.profile.read-only'), desc: t('permissions.profile.read-only.desc') },
        { id: 'standard', title: t('permissions.profile.standard'), desc: t('permissions.profile.standard.desc') },
        { id: 'unattended', title: t('permissions.profile.unattended'), desc: t('permissions.profile.unattended.desc') },
      ]
      return h('section', { className: 'dt-section' }, [
        h('div', { key: 'head', className: 'dt-section-head' }, h('div', { key: 't' }, [
          h('h2', { key: 'h', className: 'dt-h2' }, t('permissions.title')),
          h('p', { key: 'p', className: 'dt-h2-sub' }, t('permissions.subtitle')),
        ])),
        h('div', { key: 'profiles', className: 'dt-profile-grid' }, [
          h('div', { key: 'label', className: 'dt-profile-label' }, t('permissions.profile')),
          ...profiles.map(profile => h('div', { key: profile.id, className: 'dt-profile' }, [
            h('div', { key: 't', className: 'dt-profile-title' }, profile.title),
            h('div', { key: 'd', className: 'dt-profile-desc' }, profile.desc),
            h(Button, {
              key: 'a',
              size: 'sm',
              disabled: applying !== null,
              onClick: async () => {
                setApplying(profile.id)
                try {
                  await onProfile(profile.id)
                } finally {
                  setApplying(null)
                }
              },
            }, applying === profile.id ? t('common.loading') : t('permissions.apply')),
          ])),
        ]),
        h('div', { key: 'toolbar', className: 'dt-toolbar dt-toolbar-wrap' }, [
          h('label', { key: 'filter', className: 'dt-select-wrap' }, [
            h('span', { key: 'l', className: 'dt-visually-hidden' }, t('tools.selectProvider')),
            h('select', {
              key: 's',
              className: 'dt-select',
              value: providerId,
              onChange: event => setProviderId(event.target.value),
            }, [
              h('option', { key: 'all', value: 'all' }, t('permissions.allProviders')),
              ...snapshot.providers.map(provider => h('option', { key: provider.id, value: provider.id }, provider.name)),
            ]),
            h(ChevronDown, { key: 'i', size: 14 }),
          ]),
          h(SearchInput, { key: 'search', value: query, onChange: setQuery, placeholder: t('permissions.search') }),
          h('span', { key: 'count', className: 'dt-muted' }, tr(t, 'detail.toolCount', { n: filtered.length })),
        ]),
        filtered.length === 0
          ? h(EmptyState, { key: 'empty', title: t('permissions.empty') })
          : h('div', { key: 'table', className: 'dt-table-wrap' }, h('table', { className: 'dt-table' }, [
            h('thead', { key: 'h' }, h('tr', null, [
              h('th', { key: 'p' }, t('tool.provider')),
              h('th', { key: 't' }, t('tools.column.tool')),
              h('th', { key: 'l' }, t('permissions.level')),
              h('th', { key: 'pol' }, t('permissions.policy')),
            ])),
            h('tbody', { key: 'b' }, filtered.map(tool => h('tr', { key: tool.name }, [
              h('td', { key: 'p' }, h('span', { className: 'dt-provider-inline' }, [
                h(ProviderMark, { key: 'm', id: tool.providerId, name: tool.providerName, size: 14 }),
                h('span', { key: 'n' }, tool.providerName),
              ])),
              h('td', { key: 't' }, h('span', { className: 'dt-mono' }, tool.rawName)),
              h('td', { key: 'l' }, h(LevelTag, { classification: tool.classification, label: t(levelKey(tool.classification)) })),
              h('td', { key: 'pol' }, h('label', { className: 'dt-select-wrap dt-select-inline' }, [
                h('span', { key: 'l', className: 'dt-visually-hidden' }, tr(t, 'permissions.change', { name: tool.rawName })),
                h('select', {
                  key: 's',
                  className: 'dt-select',
                  value: tool.policy,
                  onChange: event => onPolicy(tool, event.target.value),
                }, ['auto', 'ask', 'block'].map(policy => h('option', { key: policy, value: policy }, t(policyKey(policy))))),
                h(ChevronDown, { key: 'i', size: 14 }),
              ])),
            ]))),
          ])),
        h('p', { key: 'note', className: 'dt-note' }, t('permissions.note')),
      ])
    }

    // ── Activity ────────────────────────────────────────────────────────────

    function ActivityPanel({ t, entries, compact = false, onClear }) {
      const [range, setRange] = useState(compact ? 'all' : '7d')
      const [expanded, setExpanded] = useState(null)
      const [confirming, setConfirming] = useState(false)
      const [clearing, setClearing] = useState(false)
      const [providerFilter, setProviderFilter] = useState('all')
      const [statusFilter, setStatusFilter] = useState('all')
      const cutoff = range === '24h' ? Date.now() - 24 * 3600_000 : range === '7d' ? Date.now() - 7 * 24 * 3600_000 : 0
      const seenProviders = new Map()
      for (const entry of entries) seenProviders.set(entry.providerId, entry.providerName)
      const visible = entries.filter(entry => {
        if (entry.ts < cutoff) return false
        if (providerFilter !== 'all' && entry.providerId !== providerFilter) return false
        if (statusFilter !== 'all' && entry.status !== statusFilter) return false
        return true
      })
      return h('section', { className: compact ? 'dt-section dt-section-compact' : 'dt-section' }, [
        !compact ? h('div', { key: 'head', className: 'dt-section-head' }, [
          h('div', { key: 't' }, [
            h('h2', { key: 'h', className: 'dt-h2' }, t('activity.title')),
            h('p', { key: 'p', className: 'dt-h2-sub' }, t('activity.subtitle')),
          ]),
          h('div', { key: 'actions', className: 'dt-inline-actions' }, [
            h('label', { key: 'range', className: 'dt-select-wrap' }, [
              h(ChevronDown, { key: 'i', size: 14 }),
              h('select', {
                key: 's',
                className: 'dt-select',
                value: range,
                onChange: event => setRange(event.target.value),
                'aria-label': t('activity.title'),
              }, ['24h', '7d', 'all'].map(value => h('option', { key: value, value }, t(`activity.range.${value}`)))),
            ]),
            h('label', { key: 'provider', className: 'dt-select-wrap' }, [
              h(ChevronDown, { key: 'i', size: 14 }),
              h('select', {
                key: 's',
                className: 'dt-select',
                value: providerFilter,
                onChange: event => setProviderFilter(event.target.value),
                'aria-label': t('activity.filter.provider'),
              }, [
                h('option', { key: 'all', value: 'all' }, t('activity.filter.provider')),
                ...[...seenProviders].map(([id, name]) => h('option', { key: id, value: id }, name)),
              ]),
            ]),
            h('label', { key: 'status', className: 'dt-select-wrap' }, [
              h(ChevronDown, { key: 'i', size: 14 }),
              h('select', {
                key: 's',
                className: 'dt-select',
                value: statusFilter,
                onChange: event => setStatusFilter(event.target.value),
                'aria-label': t('activity.filter.status'),
              }, [
                h('option', { key: 'all', value: 'all' }, t('activity.filter.status')),
                h('option', { key: 'success', value: 'success' }, t('activity.filter.success')),
                h('option', { key: 'error', value: 'error' }, t('activity.filter.error')),
              ]),
            ]),
            confirming
              ? h('span', { key: 'confirm', className: 'dt-confirm' }, [
                h('span', { key: 'q' }, t('activity.confirmClear')),
                h(Button, {
                  key: 'y',
                  size: 'sm',
                  variant: 'danger',
                  disabled: clearing,
                  onClick: async () => {
                    setClearing(true)
                    try {
                      await onClear?.()
                      setConfirming(false)
                    } finally {
                      setClearing(false)
                    }
                  },
                }, t('common.yes')),
                h(Button, { key: 'n', size: 'sm', onClick: () => setConfirming(false) }, t('common.no')),
              ])
              : h(Button, { key: 'clear', size: 'sm', onClick: () => setConfirming(true) }, t('activity.clear')),
          ]),
        ]) : null,
        h('p', { key: 'redact', className: 'dt-note' }, t('activity.redacted')),
        visible.length === 0
          ? h(EmptyState, { key: 'empty', title: t('activity.empty') })
          : h('ul', { key: 'list', className: 'dt-activity-list' }, visible.map(entry => h(ActivityRow, {
            key: entry.id,
            t,
            entry,
            expanded: expanded === entry.id,
            onToggle: () => setExpanded(expanded === entry.id ? null : entry.id),
          }))),
      ])
    }

    function ActivityRow({ t, entry, expanded, onToggle }) {
      const status = entry.status === 'error' ? 'error' : entry.classification === 'read' ? 'success' : 'info'
      const label = status === 'error' ? t('activity.error') : status === 'info' ? t('activity.info') : t('activity.success')
      return h('li', { className: 'dt-activity-row' }, [
        h('button', {
          key: 'main',
          type: 'button',
          className: 'dt-activity-main',
          onClick: onToggle,
          'aria-expanded': expanded,
        }, [
          h('span', { key: 'mark', className: 'dt-activity-mark' }, h(ProviderMark, { id: entry.providerId, name: entry.providerName, size: 20 })),
          h('span', { key: 'text', className: 'dt-activity-text' }, [
            h('span', { key: 'top', className: 'dt-activity-top' }, [
              h('span', { key: 'tool', className: 'dt-activity-tool' }, h('span', { className: 'dt-mono' }, entry.rawName)),
              h('span', { key: 'dot', className: 'dt-activity-sep' }, '·'),
              h('span', { key: 'time', className: 'dt-muted' }, timeAgo(entry.ts, (key, vars) => tr(t, key, vars))),
              entry.source === 'test' ? h('span', { key: 'src', className: 'dt-chip' }, t('activity.source.test')) : null,
            ]),
            h('span', { key: 'summary', className: 'dt-activity-summary' }, entry.summary),
            h('span', { key: 'meta', className: 'dt-activity-meta' }, [
              h('span', { key: 'p', className: 'dt-muted' }, entry.providerName),
              h('span', { key: 'sep', className: 'dt-activity-sep' }, '·'),
              h('span', { key: 'd', className: 'dt-muted' }, formatDuration(entry.durationMs)),
            ]),
          ]),
          h('span', { key: 'status', className: `dt-status dt-status-${status === 'info' ? 'connecting' : status}` }, [
            h('span', { key: 'dot', className: 'dt-status-dot' }),
            h('span', { key: 'l' }, label),
          ]),
        ]),
        expanded ? h('div', { key: 'detail', className: 'dt-activity-detail' }, [
          entry.args ? h('div', { key: 'args', className: 'dt-activity-block' }, [
            h('div', { key: 'l', className: 'dt-activity-block-label' }, t('activity.args')),
            h('pre', { key: 'p' }, entry.args),
          ]) : null,
          h('div', { key: 'result', className: 'dt-activity-block' }, [
            h('div', { key: 'l', className: 'dt-activity-block-label' }, t('activity.result')),
            h('pre', { key: 'p' }, entry.error ?? entry.summary),
          ]),
        ]) : null,
      ])
    }

    // ── dialogs ─────────────────────────────────────────────────────────────

    function ConnectDialog({ t, provider, mode, onClose, onSubmit }) {
      const isAdd = mode === 'add'
      const isFallback = isAdd === false && provider?.oauth === true
      const [name, setName] = useState(isAdd ? '' : provider?.name ?? '')
      const [url, setUrl] = useState(isAdd ? '' : provider?.url ?? '')
      const [token, setToken] = useState('')
      const [advanced, setAdvanced] = useState(isAdd)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const tokenLabel = provider?.tokenLabel ?? (isAdd ? t('dialog.add.token') : t('dialog.connect.token'))
      const scopes = provider?.tokenScopes ?? []
      const submit = async (event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await onSubmit(isAdd ? {
            name: name.trim() || 'Custom MCP',
            url: url.trim(),
            token: token.trim(),
          } : {
            id: provider.id,
            url: url.trim(),
            token: token.trim(),
            ...(provider.oauth === true ? { mode: 'token' } : {}),
          })
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy(false)
        }
      }
      const title = isAdd
        ? t('dialog.add.title')
        : tr(t, isFallback ? 'dialog.token.title' : 'dialog.connect.title', { name: provider?.name ?? '' })
      return h(Modal, {
        title,
        onClose,
        footer: [
          h(Button, { key: 'c', onClick: onClose }, t('common.cancel')),
          h('button', {
            key: 's',
            type: 'submit',
            form: 'dt-connect-form',
            className: 'dt-btn dt-btn-primary',
            disabled: busy,
          }, busy ? (isAdd ? t('common.loading') : t('dialog.connect.connecting')) : (isAdd ? t('dialog.add.submit') : t('dialog.connect.submit'))),
        ],
      }, h('form', { id: 'dt-connect-form', className: 'dt-form', onSubmit: submit }, [
        h('div', { key: 'intro', className: 'dt-dialog-intro' }, isAdd
          ? t('dialog.connect.intro')
          : tr(t, 'dialog.token.intro', { label: tokenLabel })),
        isAdd ? h('label', { key: 'name', className: 'dt-field' }, [
          h('span', { key: 'l', className: 'dt-field-label' }, t('dialog.add.name')),
          h('input', {
            key: 'i',
            className: 'dt-input',
            value: name,
            placeholder: t('dialog.add.namePlaceholder'),
            onChange: event => setName(event.target.value),
            required: true,
          }),
        ]) : null,
        isAdd ? h('label', { key: 'url', className: 'dt-field' }, [
          h('span', { key: 'l', className: 'dt-field-label' }, t('dialog.add.url')),
          h('input', {
            key: 'i',
            className: 'dt-input dt-mono',
            value: url,
            placeholder: t('dialog.add.urlPlaceholder'),
            onChange: event => setUrl(event.target.value),
            required: true,
            type: 'url',
          }),
        ]) : null,
        h('label', { key: 'token', className: 'dt-field' }, [
          h('span', { key: 'l', className: 'dt-field-label' }, tokenLabel),
          h('input', {
            key: 'i',
            className: 'dt-input',
            type: 'password',
            value: token,
            autoComplete: 'off',
            placeholder: isAdd ? '' : t('dialog.connect.tokenPlaceholder'),
            required: isAdd === false && provider?.kind !== 'custom' && provider?.hasCredential !== true,
            onChange: event => setToken(event.target.value),
          }),
          h('span', { key: 'h', className: 'dt-field-hint' }, isAdd || provider?.hasCredential !== true ? '' : t('dialog.connect.tokenKeep')),
        ]),
        scopes.length > 0 ? h('div', { key: 'scopes', className: 'dt-scopes' }, [
          h('div', { key: 'l', className: 'dt-scopes-label' }, t('dialog.token.scopes')),
          h('div', { key: 'list', className: 'dt-scope-list' }, scopes.map(scope => h('code', { key: scope, className: 'dt-scope' }, scope))),
          provider?.tokenDocs ? h('a', {
            key: 'docs',
            className: 'dt-link',
            href: provider.tokenDocs,
            target: '_blank',
            rel: 'noreferrer',
          }, t('dialog.token.create')) : null,
        ]) : provider?.tokenDocs ? h('a', {
          key: 'docs',
          className: 'dt-link',
          href: provider.tokenDocs,
          target: '_blank',
          rel: 'noreferrer',
        }, t('dialog.token.create')) : null,
        !isAdd && provider?.id === 'github' ? h('details', { key: 'guide', className: 'dt-token-guide' }, [
          h('summary', { key: 's' }, t('dialog.github.guide')),
          h('ol', { key: 'steps' }, [
            h('li', { key: '1' }, t('dialog.github.step1')),
            h('li', { key: '2' }, t('dialog.github.step2')),
            h('li', { key: '3' }, t('dialog.github.step3')),
            h('li', { key: '4' }, t('dialog.github.step4')),
            h('li', { key: '5' }, t('dialog.github.step5')),
          ]),
          h('a', {
            key: 'open',
            className: 'dt-link',
            href: 'https://github.com/settings/tokens',
            target: '_blank',
            rel: 'noreferrer',
          }, t('dialog.github.open')),
        ]) : null,
        !isAdd ? h('div', { key: 'advanced', className: 'dt-advanced' }, [
          h('button', {
            key: 'toggle',
            type: 'button',
            className: 'dt-link-btn',
            onClick: () => setAdvanced(!advanced),
            'aria-expanded': advanced,
          }, [h(ChevronDown, { key: 'i', size: 13 }), t('dialog.connect.advanced')]),
          advanced ? h('label', { key: 'field', className: 'dt-field' }, [
            h('span', { key: 'l', className: 'dt-field-label' }, t('dialog.connect.endpoint')),
            h('input', {
              key: 'i',
              className: 'dt-input dt-mono',
              value: url,
              type: 'url',
              onChange: event => setUrl(event.target.value),
            }),
            h('span', { key: 'h', className: 'dt-field-hint' }, t('dialog.connect.endpointHint')),
          ]) : null,
        ]) : null,
        error !== null ? h('div', { key: 'error', className: 'dt-form-error' }, error) : null,
      ]))
    }

    function OAuthDialog({ t, provider, onClose, onSuccess, onUseToken }) {
      const [phase, setPhase] = useState('preparing')
      const [authorizeUrl, setAuthorizeUrl] = useState(null)
      const [flowId, setFlowId] = useState(null)
      const [error, setError] = useState(null)
      const [copied, setCopied] = useState(false)
      const popupRef = useRef(null)
      const timerRef = useRef(null)
      const pollingRef = useRef(null)
      const mountedRef = useRef(true)
      const startedRef = useRef(false)

      const stopPolling = () => {
        if (timerRef.current !== null) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        pollingRef.current = null
      }

      const poll = (id) => {
        if (pollingRef.current === id && timerRef.current !== null) return
        stopPolling()
        pollingRef.current = id
        const startedAt = Date.now()
        timerRef.current = setInterval(async () => {
          try {
            const data = await call('oauthStatus', { flowId: id })
            if (!mountedRef.current) return
            const status = data.status ?? {}
            if (status.phase === 'success') {
              stopPolling()
              popupRef.current?.close()
              setPhase('success')
              onSuccess()
              setTimeout(() => { if (mountedRef.current) onClose() }, 900)
            } else if (status.phase === 'error' || status.phase === 'missing') {
              stopPolling()
              setPhase('error')
              setError(status.error ?? t('oauth.failed'))
            } else if (Date.now() - startedAt > 10 * 60_000) {
              stopPolling()
              setPhase('error')
              setError(t('oauth.timeout'))
            }
          } catch {
            if (Date.now() - startedAt > 10 * 60_000) {
              stopPolling()
              setPhase('error')
              setError(t('oauth.timeout'))
            }
          }
        }, 1200)
      }

      const prepare = async () => {
        stopPolling()
        setPhase('preparing')
        setError(null)
        setAuthorizeUrl(null)
        setFlowId(null)
        try {
          const data = await call('oauthStart', { id: provider.id })
          if (!mountedRef.current) return
          setAuthorizeUrl(data.authorizeUrl)
          setFlowId(data.flowId)
          // Poll immediately: Electron may hand window.open to the system
          // browser and return null, so a null popup does not mean the user
          // did not authorize. The callback can complete at any time.
          poll(data.flowId)
          // Enter the in-progress state before handing the URL to the browser.
          // Electron may open the system browser and return null; a null
          // return therefore cannot be treated as "not opened".
          setPhase('waiting')
          let popup = null
          let blocked = false
          try {
            popup = window.open(data.authorizeUrl, '_blank')
            if (popup) popup.opener = null
          } catch {
            blocked = true
          }
          if (blocked) {
            setPhase('ready')
          } else {
            popupRef.current = popup
          }
        } catch (failure) {
          setPhase('error')
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      useEffect(() => {
        mountedRef.current = true
        if (!startedRef.current) {
          startedRef.current = true
          void prepare()
        }
        return () => {
          mountedRef.current = false
          stopPolling()
        }
      }, [])

      // Runs inside the click handler, so the browser sees a user gesture.
      const launch = () => {
        if (authorizeUrl === null || flowId === null) return
        try {
          const popup = window.open(authorizeUrl, '_blank')
          if (popup) popup.opener = null
          popupRef.current = popup
        } catch { /* the copy-link fallback remains available */ }
        setPhase('waiting')
        poll(flowId)
      }

      const openAgain = () => {
        if (authorizeUrl === null) return
        try {
          const opened = window.open(authorizeUrl, '_blank')
          if (opened) opened.opener = null
          popupRef.current = opened
        } catch { /* the copy-link fallback remains available */ }
        if (phase !== 'waiting' && flowId !== null) {
          setPhase('waiting')
          poll(flowId)
        }
      }

      const copyLink = async () => {
        if (authorizeUrl === null) return
        try {
          await navigator.clipboard.writeText(authorizeUrl)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch { /* clipboard is unavailable; the link remains visible */ }
      }

      const phaseText = phase === 'success'
        ? tr(t, 'toast.signedIn', { name: provider.name })
        : phase === 'error'
          ? (error ?? t('oauth.failed'))
          : phase === 'waiting'
            ? t('oauth.waiting')
            : phase === 'ready'
              ? t('oauth.ready')
              : t('oauth.preparing')

      const body = [
        h('p', { key: 'intro', className: 'dt-dialog-intro' }, tr(t, 'oauth.intro', { name: provider.name })),
        provider.id === 'figma' ? h('p', { key: 'figmaNote', className: 'dt-note' }, t('oauth.figmaNote')) : null,
        h('div', { key: 'phase', className: 'dt-oauth-phase' }, [
          phase === 'preparing' || phase === 'waiting' ? h('span', { key: 's', className: 'dt-spinner' }) : null,
          h('span', { key: 't' }, phaseText),
        ]),
        phase === 'ready' ? h('p', { key: 'ready', className: 'dt-note' }, tr(t, 'oauth.readyHint', { name: provider.name })) : null,
        phase === 'waiting' ? h('p', { key: 'hint', className: 'dt-note' }, t('oauth.waitingHint')) : null,
        phase === 'waiting' ? h('p', { key: 'blocked', className: 'dt-note' }, t('oauth.waitingBlockedHint')) : null,
        phase === 'waiting' && authorizeUrl !== null ? h('div', { key: 'links', className: 'dt-inline-actions' }, [
          h(Button, { key: 'open', size: 'sm', onClick: openAgain }, t('action.openBrowser')),
          h(Button, { key: 'copy', size: 'sm', onClick: copyLink }, copied ? t('oauth.copied') : t('action.copyLink')),
        ]) : null,
        provider.tokenFallback === true && (phase === 'ready' || phase === 'error')
          ? h('button', {
            key: 'fallback',
            type: 'button',
            className: 'dt-link-btn',
            onClick: onUseToken,
          }, t('oauth.tokenFallback'))
          : null,
      ]

      const primary = phase === 'preparing'
        ? h(Button, { key: 'go', variant: 'primary', disabled: true }, t('oauth.preparing'))
        : phase === 'ready'
          ? h(Button, { key: 'go', variant: 'primary', onClick: launch }, tr(t, 'oauth.start', { name: provider.name }))
          : phase === 'error'
            ? h(Button, { key: 'go', variant: 'primary', onClick: () => { void prepare() } }, t('common.retry'))
            : null

      return h(Modal, {
        title: tr(t, 'oauth.title', { name: provider.name }),
        subtitle: provider.description,
        onClose,
        footer: [
          h(Button, { key: 'c', onClick: onClose }, phase === 'waiting' ? t('common.cancel') : t('common.close')),
          primary,
        ],
      }, body)
    }

    function LocalDialog({ t, provider, onClose, onSubmit }) {
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const submit = async () => {
        setBusy(true)
        setError(null)
        try {
          await onSubmit()
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
          setBusy(false)
        }
      }
      const steps = [t('local.step1'), t('local.step2'), t('local.step3'), t('local.step4')]
      return h(Modal, {
        title: tr(t, 'local.title', { name: provider.name }),
        onClose,
        footer: [
          h(Button, { key: 'c', onClick: onClose }, t('common.cancel')),
          h(Button, { key: 'go', variant: 'primary', disabled: busy, onClick: submit }, busy ? t('common.loading') : t('local.connect')),
        ],
      }, [
        h('p', { key: 'intro', className: 'dt-dialog-intro' }, tr(t, 'local.intro', { name: provider.name })),
        h('p', { key: 'requirement', className: 'dt-note' }, t('local.requirement')),
        h('ol', { key: 'steps', className: 'dt-local-steps' }, steps.map((step, index) => h('li', { key: index }, step))),
        h('div', { key: 'endpoint', className: 'dt-local-endpoint' }, [
          h('span', { key: 'l', className: 'dt-field-label' }, t('local.endpoint')),
          h('code', { key: 'v' }, provider.url),
        ]),
        h('p', { key: 'note', className: 'dt-note' }, t('local.note')),
        h('p', { key: 'onlyApp', className: 'dt-note' }, t('local.onlyApp')),
        h('p', { key: 'noDevMode', className: 'dt-note' }, t('local.noDevMode')),
        h('p', { key: 'agentHint', className: 'dt-note' }, t('local.agentHint')),
        h('p', { key: 'catalogLimit', className: 'dt-note' }, t('local.catalogLimit')),
        h('a', {
          key: 'learnMore',
          className: 'dt-link',
          href: 'https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server',
          target: '_blank',
          rel: 'noreferrer',
        }, t('local.learnMore')),
        h('a', {
          key: 'waitlist',
          className: 'dt-link',
          href: 'https://form.asana.com/?k=kBG-ejRQTdY8x_H6a4vM3Q&d=10497086658021',
          target: '_blank',
          rel: 'noreferrer',
        }, t('local.waitlist')),
        h('p', { key: 'check', className: 'dt-note' }, t('local.check')),
        h('a', {
          key: 'docs',
          className: 'dt-link',
          href: 'https://developers.figma.com/docs/figma-mcp-server/local-server-installation/',
          target: '_blank',
          rel: 'noreferrer',
        }, t('local.docs')),
        error !== null ? h('div', { key: 'error', className: 'dt-form-error' }, error) : null,
      ])
    }

    function ConfirmDialog({ t, title, body, confirmLabel, onClose, onConfirm }) {
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      return h(Modal, {
        title,
        onClose,
        footer: [
          h(Button, { key: 'c', onClick: onClose }, t('common.cancel')),
          h(Button, {
            key: 'y',
            variant: 'danger',
            disabled: busy,
            onClick: async () => {
              setBusy(true)
              setError(null)
              try {
                await onConfirm()
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : String(failure))
              } finally {
                setBusy(false)
              }
            },
          }, busy ? t('common.loading') : confirmLabel),
        ],
      }, [
        h('p', { key: 'body', className: 'dt-dialog-body' }, body),
        error !== null ? h('div', { key: 'error', className: 'dt-form-error' }, error) : null,
      ])
    }

    function TestDialog({ t, provider, onClose, onProbe }) {
      const [state, setState] = useState({ phase: 'running' })
      useEffect(() => {
        let cancelled = false
        void (async () => {
          try {
            const result = await onProbe(provider.id)
            if (cancelled) return
            const probe = result.probe ?? {}
            setState({ phase: probe.ok === true ? 'ok' : 'fail', probe })
          } catch (error) {
            if (!cancelled) setState({ phase: 'fail', error: error instanceof Error ? error.message : String(error) })
          }
        })()
        return () => { cancelled = true }
      }, [])
      const body = state.phase === 'running'
        ? h('div', { className: 'dt-probe dt-probe-running' }, [
          h('span', { key: 's', className: 'dt-spinner' }),
          h('span', { key: 't' }, t('dialog.test.running')),
        ])
        : state.phase === 'ok'
          ? h('div', { className: 'dt-probe dt-probe-ok' }, [
            h('div', { key: 't' }, tr(t, 'dialog.test.ok', { n: state.probe?.toolNames?.length ?? state.probe?.toolCount ?? 0 })),
            h('div', { key: 'd', className: 'dt-muted' }, tr(t, 'dialog.test.duration', { n: state.probe?.durationMs ?? 0 })),
          ])
          : h('div', { className: 'dt-probe dt-probe-fail' }, [
            h('div', { key: 't' }, t('dialog.test.fail')),
            h('div', { key: 'e', className: 'dt-error-text' }, state.error ?? state.probe?.error ?? state.probe?.lastError ?? ''),
          ])
      return h(Modal, {
        title: tr(t, 'dialog.test.title', { name: provider.name }),
        onClose,
        footer: h(Button, { key: 'c', onClick: onClose }, t('common.close')),
      }, body)
    }

    function ToolDialog({ t, tool, provider, onClose, onRun, onCopy }) {
      const [detail, setDetail] = useState(null)
      const [loadError, setLoadError] = useState(null)
      const [values, setValues] = useState({})
      const [result, setResult] = useState(null)
      const [running, setRunning] = useState(false)
      const [formError, setFormError] = useState(null)
      const [copied, setCopied] = useState(false)

      useEffect(() => {
        let cancelled = false
        void (async () => {
          try {
            const data = await call('tool', { name: tool.name })
            if (cancelled) return
            setDetail(data.tool)
            setValues(initialArgs(data.tool.parameters))
          } catch (error) {
            if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
          }
        })()
        return () => { cancelled = true }
      }, [tool.name])

      const parameters = detail?.parameters ?? { type: 'object', properties: {} }
      const properties = parameters?.properties ?? {}
      const required = Array.isArray(parameters?.required) ? parameters.required : []
      const entries = Object.entries(properties)

      const setValue = (name, value) => setValues(current => ({ ...current, [name]: value }))

      const buildArgs = () => {
        const args = {}
        const errors = []
        for (const [name, property] of entries) {
          const raw = values[name]
          const type = property?.type
          if (required.includes(name) && (raw === undefined || raw === '' || raw === null)) {
            errors.push(tr(t, 'tool.missingRequired', { name }))
            continue
          }
          if (raw === undefined || raw === '') {
            if (required.includes(name)) errors.push(tr(t, 'tool.missingRequired', { name }))
            continue
          }
          if (type === 'number' || type === 'integer') {
            const parsed = Number(raw)
            if (Number.isNaN(parsed)) errors.push(tr(t, 'tool.invalidJson', { name }))
            else args[name] = parsed
          } else if (type === 'boolean') {
            args[name] = raw === true
          } else if (type === 'object' || type === 'array') {
            try {
              args[name] = JSON.parse(raw)
            } catch {
              errors.push(tr(t, 'tool.invalidJson', { name }))
            }
          } else if (Array.isArray(property?.enum)) {
            args[name] = raw
          } else {
            args[name] = raw
          }
        }
        return { args, errors }
      }

      const run = async () => {
        const { args, errors } = buildArgs()
        if (errors.length > 0) {
          setFormError(errors.join(' '))
          return
        }
        setFormError(null)
        setRunning(true)
        setResult(null)
        try {
          const data = await onRun(tool, args)
          setResult(data)
        } catch (error) {
          setResult({ ok: false, text: '', error: error instanceof Error ? error.message : String(error), durationMs: 0 })
        } finally {
          setRunning(false)
        }
      }

      const copyResult = async () => {
        const text = result?.error ?? result?.text ?? ''
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          const area = document.createElement('textarea')
          area.value = text
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          try { document.execCommand('copy') } catch { /* ignore */ }
          area.remove()
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }
      }

      const body = loadError !== null
        ? h('div', { className: 'dt-form-error' }, loadError)
        : detail === null
          ? h('div', { className: 'dt-loading' }, [h('span', { key: 's', className: 'dt-spinner' }), t('common.loading')])
          : h('div', { className: 'dt-tool-detail' }, [
            h('p', { key: 'desc', className: 'dt-tool-desc' }, detail.description || '—'),
            h('div', { key: 'meta', className: 'dt-tool-meta' }, [
              h(LevelTag, { key: 'l', classification: detail.classification, label: t(levelKey(detail.classification)) }),
              h('span', { key: 'p', className: 'dt-chip' }, `${t('tool.policy')}: ${t(policyKey(detail.policy))}`),
              h('span', { key: 'e', className: 'dt-muted' }, detail.enabled ? t('tools.enabled') : t('tools.disabled')),
            ]),
            !detail.enabled ? h('div', { key: 'warn', className: 'dt-inline-warning' }, t('tool.disabledWarning')) : null,
            h('section', { key: 'schema', className: 'dt-tool-section' }, [
              h('h4', { key: 'h', className: 'dt-tool-section-title' }, t('tool.schema')),
              entries.length === 0
                ? h('p', { key: 'n', className: 'dt-muted' }, t('tool.noParams'))
                : h('div', { key: 'table', className: 'dt-table-wrap' }, h('table', { className: 'dt-table dt-table-compact' }, [
                  h('thead', { key: 'h' }, h('tr', null, [
                    h('th', { key: 'n' }, t('tool.param.name')),
                    h('th', { key: 't' }, t('tool.param.type')),
                    h('th', { key: 'r' }, t('tool.param.required')),
                    h('th', { key: 'd' }, t('tool.param.description')),
                  ])),
                  h('tbody', { key: 'b' }, entries.map(([name, property]) => h('tr', { key: name }, [
                    h('td', { key: 'n' }, h('span', { className: 'dt-mono' }, name)),
                    h('td', { key: 't' }, h('span', { className: 'dt-muted' }, schemaType(property))),
                    h('td', { key: 'r' }, required.includes(name) ? t('common.yes') : t('common.no')),
                    h('td', { key: 'd', className: 'dt-td-desc' }, schemaDescription(property)),
                  ]))),
                ])),
            ]),
            h('section', { key: 'test', className: 'dt-tool-section' }, [
              h('h4', { key: 'h', className: 'dt-tool-section-title' }, t('tool.test')),
              h('p', { key: 'hint', className: 'dt-note' }, t('tool.testHint')),
              entries.length > 0 ? h('div', { key: 'form', className: 'dt-form dt-form-grid' }, entries.map(([name, property]) => h('label', {
                key: name,
                className: `dt-field${property?.type === 'object' || property?.type === 'array' ? ' dt-field-wide' : ''}`,
              }, [
                h('span', { key: 'l', className: 'dt-field-label' }, [
                  h('span', { key: 'n' }, name),
                  required.includes(name) ? h('span', { key: 'r', className: 'dt-required' }, '*') : null,
                  h('span', { key: 't', className: 'dt-field-type' }, schemaType(property)),
                ]),
                Array.isArray(property?.enum)
                  ? h('span', { key: 's', className: 'dt-select-wrap' }, [
                    h('select', {
                      key: 'sel',
                      className: 'dt-select',
                      value: values[name] ?? property.enum[0],
                      onChange: event => setValue(name, event.target.value),
                    }, property.enum.map(option => h('option', { key: String(option), value: option }, String(option)))),
                    h(ChevronDown, { key: 'i', size: 14 }),
                  ])
                  : property?.type === 'boolean'
                    ? h(Toggle, { key: 'b', checked: values[name] === true, onChange: value => setValue(name, value), label: name })
                    : property?.type === 'object' || property?.type === 'array'
                      ? h('textarea', {
                        key: 'ta',
                        className: 'dt-input dt-textarea dt-mono',
                        rows: 3,
                        value: values[name] ?? '',
                        placeholder: property?.type === 'array' ? '[…]' : '{…}',
                        onChange: event => setValue(name, event.target.value),
                      })
                      : h('input', {
                        key: 'i',
                        className: 'dt-input',
                        type: property?.type === 'number' || property?.type === 'integer' ? 'number' : 'text',
                        value: values[name] ?? '',
                        onChange: event => setValue(name, event.target.value),
                      }),
                schemaDescription(property) ? h('span', { key: 'd', className: 'dt-field-hint' }, schemaDescription(property)) : null,
              ]))) : null,
              formError !== null ? h('div', { key: 'err', className: 'dt-form-error' }, formError) : null,
              h('div', { key: 'actions', className: 'dt-inline-actions' }, h(Button, {
                key: 'run',
                variant: 'primary',
                disabled: running,
                onClick: run,
              }, running ? t('tool.running') : t('tool.run'))),
            ]),
            result !== null ? h('section', { key: 'result', className: 'dt-tool-section' }, [
              h('div', { key: 'head', className: 'dt-result-head' }, [
                h('h4', { key: 'h', className: 'dt-tool-section-title' }, t('tool.result')),
                h('div', { key: 'meta', className: 'dt-inline-actions' }, [
                  h('span', {
                    key: 'status',
                    className: result.ok ? 'dt-success-text' : 'dt-error-text',
                  }, result.ok ? tr(t, 'tool.result.ok', { n: formatDuration(result.durationMs) }) : t('tool.result.error')),
                  h(Button, { key: 'copy', size: 'sm', onClick: copyResult }, [
                    h(CopyIcon, { key: 'i', size: 13 }),
                    copied ? t('tool.copied') : t('tool.copy'),
                  ]),
                ]),
              ]),
              h('pre', { key: 'pre', className: `dt-result${result.ok ? '' : ' dt-result-error'}` }, result.error ?? result.text ?? ''),
            ]) : null,
          ])

      return h(Modal, {
        title: h('span', { className: 'dt-modal-title-tool' }, [
          h(ProviderMark, { key: 'm', id: provider?.id ?? tool.providerId, name: provider?.name, size: 18 }),
          h('span', { key: 'n', className: 'dt-mono' }, tool.rawName),
        ]),
        label: tool.rawName,
        subtitle: provider?.name,
        onClose,
        wide: true,
        footer: h(Button, { key: 'c', onClick: onClose }, t('common.close')),
      }, body)
    }

    // ── page ────────────────────────────────────────────────────────────────

    function DevToolsPage({ t: rawT }) {
      const t = typeof rawT === 'function' ? rawT : (key) => key
      const [snapshot, setSnapshot] = useState(null)
      const [loadError, setLoadError] = useState(null)
      const [tab, setTab] = useState('integrations')
      const [detailId, setDetailId] = useState(null)
      const [detailTab, setDetailTab] = useState('overview')
      const [notice, setNotice] = useState(null)
      const [dialog, setDialog] = useState(null)
      const [busy, setBusy] = useState(null)

      const notify = useCallback((text, kind = 'success') => {
        setNotice({ text, kind })
      }, [])

      useEffect(() => {
        if (notice === null) return undefined
        const timer = setTimeout(() => setNotice(null), 4200)
        return () => clearTimeout(timer)
      }, [notice])

      const load = useCallback(async (quiet = false) => {
        try {
          const data = await call('state', {})
          setSnapshot(data)
          setLoadError(null)
        } catch (error) {
          if (!quiet) setLoadError(error instanceof Error ? error.message : String(error))
        }
      }, [])

      useEffect(() => {
        let cancelled = false
        void (async () => {
          try {
            const data = await call('state', {})
            if (!cancelled) {
              setSnapshot(data)
              setLoadError(null)
            }
          } catch (error) {
            if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
          }
        })()
        const timer = setInterval(() => {
          if (document.visibilityState === 'visible') void load(true)
        }, 2500)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [load])

      const perform = useCallback(async (action, body, options = {}) => {
        setBusy(action)
        try {
          const data = await call(action, body)
          if (data !== null && typeof data === 'object' && Array.isArray(data.providers)) {
            setSnapshot(data)
          } else if (options.refresh !== false) {
            await load(true)
          }
          if (options.success !== undefined) notify(options.success)
          return data
        } catch (error) {
          if (options.silentError !== true) notify(error instanceof Error ? error.message : String(error), 'error')
          if (options.rethrow === true) throw error
          return null
        } finally {
          setBusy(null)
        }
      }, [load, notify])

      const detailProvider = detailId === null || snapshot === null
        ? null
        : snapshot.providers.find(provider => provider.id === detailId) ?? null

      const openDetail = useCallback((id, tab = 'overview') => {
        setDetailTab(tab)
        setDetailId(id)
      }, [])

      const handleProviderAction = useCallback(async (kind, provider, value) => {
        if (kind === 'reconnect') {
          if (provider.needsAuth === true || (provider.oauth === true && provider.hasCredential !== true)) {
            setDialog({ kind: 'oauth', provider })
            return
          }
          if (provider.oauth === true) {
            try {
              await perform('reconnect', { id: provider.id }, {
                success: tr(t, 'toast.connected', { name: provider.name }),
                rethrow: true,
                silentError: true,
              })
            } catch {
              setDialog({ kind: 'oauth', provider })
            }
            return
          }
          await perform('reconnect', { id: provider.id }, { success: tr(t, 'toast.connected', { name: provider.name }) })
        } else if (kind === 'approval') {
          await perform('setRequireApproval', { id: provider.id, value }, { success: t('toast.approval') })
        } else if (kind === 'test') {
          setDialog({ kind: 'test', provider })
        } else if (kind === 'toolMode') {
          if (value === 'all') {
            setDialog({ kind: 'enableAll', provider })
            return
          }
          await perform('setProviderToolMode', { id: provider.id, mode: value }, {
            success: value === 'recommended' ? t('tools.policy.resetDone') : t('toast.bulk'),
          })
        }
      }, [perform, t])

      const handleToolToggle = useCallback(async (tool, enabled) => {
        await perform('setToolEnabled', { name: tool.name, enabled }, {
          success: enabled ? t('toast.toolEnabled') : t('toast.toolDisabled'),
        })
      }, [perform, t])

      const handleBulk = useCallback(async (providerId, enabled) => {
        const provider = snapshot?.providers.find(item => item.id === providerId)
        if (enabled && provider !== undefined) {
          setDialog({ kind: 'enableAll', provider })
          return
        }
        await perform('setProviderToolsEnabled', { id: providerId, enabled }, { success: t('toast.bulk') })
      }, [perform, snapshot, t])

      const handlePolicy = useCallback(async (tool, policy) => {
        await perform('setPolicy', { name: tool.name, policy }, { success: t('toast.policy') })
      }, [perform, t])

      const handleProfile = useCallback(async (profile) => {
        const data = await perform('applyProfile', { profile }, { success: t('permissions.applied') })
        return data
      }, [perform, t])

      const handleConnect = useCallback(async (id) => {
        const provider = snapshot?.providers.find(item => item.id === id)
        if (provider === undefined) return
        if (provider.authMode === 'local') {
          setDialog({ kind: 'local', provider })
          return
        }
        if (provider.authMode === 'oauth') {
          if (provider.hasCredential === true && provider.needsAuth !== true) {
            try {
              const data = await perform('reconnect', { id }, {
                success: tr(t, 'toast.connected', { name: provider.name }),
                rethrow: true,
                silentError: true,
              })
              if (data !== null) return
            } catch { /* fall through to a fresh sign-in */ }
          }
          setDialog({ kind: 'oauth', provider })
          return
        }
        setDialog({ kind: 'connect', provider })
      }, [snapshot, perform, t])

      const handleAdd = useCallback(() => setDialog({ kind: 'add' }), [])

      const handleTool = useCallback((tool) => {
        setDialog({ kind: 'tool', tool })
      }, [])

      const handleConfirm = useCallback((kind, provider) => {
        setDialog({ kind: 'confirm', confirmKind: kind, provider })
      }, [])

      // If the connection completes in another tab (or the Host's callback
      // landed while the dialog was open), close the dialog even when status
      // polling missed the transition.
      useEffect(() => {
        if (dialog === null || dialog.kind !== 'oauth' || snapshot === null) return
        const current = snapshot.providers.find(provider => provider.id === dialog.provider.id)
        if (current === undefined || current.status !== 'connected' || current.hasCredential !== true) return
        setDialog(null)
        notify(tr(t, 'toast.signedIn', { name: current.name }))
      }, [dialog, snapshot, notify, t])

      const tabs = [
        { id: 'integrations', label: t('tab.integrations'), icon: h(GridIcon, { size: 15 }) },
        { id: 'tools', label: t('tab.tools'), icon: h(WrenchIcon, { size: 15 }) },
        { id: 'permissions', label: t('tab.permissions'), icon: h(ShieldIcon, { size: 15 }) },
        { id: 'activity', label: t('tab.activity'), icon: h(ClockIcon, { size: 15 }) },
      ]

      if (snapshot === null) {
        return h('div', { className: 'dt-page' }, [
          h('style', { key: 'css' }, CSS),
          h('div', { key: 'shell', className: 'dt-shell' }, [
            loadError !== null
              ? h('div', { key: 'err', className: 'dt-error-panel' }, [
                h('div', { key: 't', className: 'dt-error-title' }, t('error.load')),
                h('div', { key: 'm', className: 'dt-error-text' }, loadError),
                h(Button, { key: 'r', onClick: () => void load() }, t('common.retry')),
              ])
              : h('div', { key: 'load', className: 'dt-loading' }, [h('span', { key: 's', className: 'dt-spinner' }), t('common.loading')]),
          ]),
        ])
      }

      const body = detailProvider !== null
        ? h(ProviderDetail, {
          key: `detail-${detailProvider.id}`,
          t,
          snapshot,
          provider: detailProvider,
          initialTab: detailTab,
          onBack: () => setDetailId(null),
          onAction: handleProviderAction,
          onTool: handleTool,
          onConnect: handleConnect,
          onConfirm: handleConfirm,
        })
        : tab === 'integrations'
          ? h(IntegrationsPanel, {
            key: 'integrations',
            t,
            snapshot,
            onOpen: openDetail,
            onConnect: handleConnect,
            onAdd: handleAdd,
            onReset: () => setDialog({ kind: 'reset' }),
          })
          : tab === 'tools'
            ? h(ToolsPanel, {
              key: 'tools',
              t,
              snapshot,
              onTool: handleTool,
              onToggle: handleToolToggle,
              onViewProvider: id => openDetail(id, 'tools'),
              onBulk: handleBulk,
            })
            : tab === 'permissions'
              ? h(PermissionsPanel, {
                key: 'permissions',
                t,
                snapshot,
                onPolicy: handlePolicy,
                onProfile: handleProfile,
              })
              : h(ActivityPanel, {
                key: 'activity',
                t,
                entries: snapshot.activity,
                onClear: async () => {
                  await perform('clearActivity', {}, { success: t('toast.cleared') })
                },
              })

      return h('div', { className: 'dt-page' }, [
        h('style', { key: 'css' }, CSS),
        h('div', { key: 'shell', className: 'dt-shell' }, [
          h(Notice, { key: 'notice', notice }),
          detailProvider !== null ? null : h('header', { key: 'head', className: 'dt-head' }, [
            h('div', { key: 'brand', className: 'dt-brand' }, [
              h('div', { key: 'mark', className: 'dt-brand-mark' }, h(CubeMark, { size: 26 })),
              h('div', { key: 'text' }, [
                h('h1', { key: 't', className: 'dt-title' }, t('title')),
                h('p', { key: 's', className: 'dt-sub' }, t('subtitle')),
              ]),
            ]),
            h('span', { key: 'badge', className: 'dt-badge' }, tr(t, 'badge.integrations', { n: snapshot.totals.integrations })),
          ]),
          detailProvider !== null ? null : h(Tabs, { key: 'tabs', items: tabs, value: tab, onChange: setTab }),
          h('div', { key: 'body', className: 'dt-body' }, h(PanelBoundary, { key: detailProvider !== null ? `detail-${detailProvider.id}` : tab, t }, body)),
        ]),
        dialog === null ? null : renderDialog(),
      ])

      function renderDialog() {
        if (dialog === null) return null
        if (dialog.kind === 'oauth') {
          return h(OAuthDialog, {
            key: 'oauth',
            t,
            provider: dialog.provider,
            onClose: () => setDialog(null),
            onSuccess: () => { void load(false) },
            onUseToken: () => setDialog({ kind: 'connect', provider: dialog.provider }),
          })
        }
        if (dialog.kind === 'local') {
          return h(LocalDialog, {
            key: 'local',
            t,
            provider: dialog.provider,
            onClose: () => setDialog(null),
            onSubmit: async () => {
              const data = await perform('connect', { id: dialog.provider.id, mode: 'local' }, {
                success: tr(t, 'toast.connected', { name: dialog.provider.name }),
                rethrow: true,
                silentError: true,
              })
              if (data === null) throw new Error(t('local.failed'))
              setDialog(null)
            },
          })
        }
        if (dialog.kind === 'connect') {
          return h(ConnectDialog, {
            key: 'connect',
            t,
            provider: dialog.provider,
            mode: 'connect',
            onClose: () => setDialog(null),
            onSubmit: async (body) => {
              const data = await perform('connect', body, {
                success: tr(t, 'toast.connected', { name: dialog.provider?.name ?? '' }),
                rethrow: true,
                silentError: true,
              })
              if (data === null) throw new Error(t('error.action'))
              setDialog(null)
            },
          })
        }
        if (dialog.kind === 'add') {
          return h(ConnectDialog, {
            key: 'add',
            t,
            provider: null,
            mode: 'add',
            onClose: () => setDialog(null),
            onSubmit: async (body) => {
              const data = await perform('addProvider', body, { success: t('toast.added'), rethrow: true, silentError: true })
              if (data === null) throw new Error(t('error.action'))
              setDialog(null)
            },
          })
        }
        if (dialog.kind === 'test') {
          return h(TestDialog, {
            key: 'test',
            t,
            provider: dialog.provider,
            onClose: () => setDialog(null),
            onProbe: async (id) => perform('probe', { id }, { refresh: false, rethrow: true, silentError: true }),
          })
        }
        if (dialog.kind === 'tool') {
          const provider = snapshot.providers.find(item => item.id === dialog.tool.providerId)
          return h(ToolDialog, {
            key: 'tool',
            t,
            tool: dialog.tool,
            provider,
            onClose: () => setDialog(null),
            onRun: async (tool, args) => {
              const data = await perform('invoke', { name: tool.name, args }, { refresh: false, rethrow: true, silentError: true })
              if (data === null) throw new Error(t('error.action'))
              return data
            },
          })
        }
        if (dialog.kind === 'reset') {
          return h(ConfirmDialog, {
            key: 'reset',
            t,
            title: t('reset.title'),
            body: t('reset.body'),
            confirmLabel: t('reset.confirm'),
            onClose: () => setDialog(null),
            onConfirm: async () => {
              const data = await perform('resetAll', {}, {
                success: t('reset.done'),
                rethrow: true,
                silentError: true,
              })
              if (data === null) throw new Error(t('error.action'))
              setDetailId(null)
              setDialog(null)
            },
          })
        }
        if (dialog.kind === 'enableAll') {
          const provider = dialog.provider
          const tokens = tokenText(provider.schemaTokens ?? 0)
          return h(ConfirmDialog, {
            key: 'enableAll',
            t,
            title: tr(t, 'tools.enableAll.title', { n: provider.toolCount }),
            body: tr(t, 'tools.enableAll.body', { tokens }),
            confirmLabel: t('tools.enableAll.confirm'),
            onClose: () => setDialog(null),
            onConfirm: async () => {
              const data = await perform('setProviderToolMode', { id: provider.id, mode: 'all' }, {
                success: t('toast.bulk'),
                rethrow: true,
                silentError: true,
              })
              if (data === null) throw new Error(t('error.action'))
              setDialog(null)
            },
          })
        }
        if (dialog.kind === 'confirm') {
          const provider = dialog.provider
          const isRemove = dialog.confirmKind === 'remove'
          return h(ConfirmDialog, {
            key: 'confirm',
            t,
            title: tr(t, isRemove ? 'dialog.remove.title' : 'dialog.disconnect.title', { name: provider.name }),
            body: t(isRemove
              ? 'dialog.remove.body'
              : provider.oauth === true ? 'dialog.disconnect.oauthBody' : 'dialog.disconnect.body'),
            confirmLabel: t(isRemove ? 'action.remove' : 'action.disconnect'),
            onClose: () => setDialog(null),
            onConfirm: async () => {
              const data = isRemove
                ? await perform('removeProvider', { id: provider.id }, { success: t('toast.removed'), rethrow: true, silentError: true })
                : await perform('disconnect', { id: provider.id }, { success: tr(t, 'toast.disconnected', { name: provider.name }), rethrow: true, silentError: true })
              if (data === null) throw new Error(t('error.action'))
              if (isRemove && detailId === provider.id) setDetailId(null)
              setDialog(null)
            },
          })
        }
        return null
      }
    }

    // ── styles ──────────────────────────────────────────────────────────────

    const CSS = `
.dt-page {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  padding: calc(var(--dsh-frame-top-clearance, 0px) + 26px) 0 56px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  overscroll-behavior: contain;
}
.dt-page *, .dt-page *::before, .dt-page *::after { box-sizing: border-box; }
.dt-page ::-webkit-scrollbar { width: 10px; height: 10px; }
.dt-shell {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 clamp(20px, 4vw, 48px);
}
.dt-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dt-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.dt-brand > div:last-child { min-width: 0; }
.dt-brand-mark {
  width: 44px; height: 44px; border-radius: 13px; flex: none;
  display: grid; place-items: center; color: #fff;
  background: linear-gradient(145deg, #8b6cff, #6a4cff);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
}
.dt-title { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
.dt-sub { margin: 2px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dt-badge {
  flex: none; display: inline-flex; align-items: center; height: 24px; padding: 0 10px;
  border-radius: 999px; font-size: 12px; font-weight: 500;
  color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);
}
.dt-tabs { display: flex; gap: 26px; margin-top: 22px; border-bottom: 1px solid var(--dsw-alias-border-l2); overflow-x: auto; scrollbar-width: none; }
.dt-tabs::-webkit-scrollbar { display: none; }
.dt-tab {
  position: relative; display: inline-flex; align-items: center; gap: 7px;
  padding: 10px 1px 11px; margin-bottom: -1px; border: none; background: none; white-space: nowrap;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13.5px; line-height: 20px;
  cursor: pointer; border-bottom: 2px solid transparent;
}
.dt-tab:hover { color: var(--dsw-alias-label-primary); }
.dt-tab[aria-selected="true"] { color: var(--dsw-alias-label-primary); font-weight: 500; border-bottom-color: var(--dsw-alias-brand-primary); }
.dt-tab-icon { display: inline-flex; opacity: .75; }
.dt-tab:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 4px; }
.dt-body { padding-top: 26px; }
.dt-section { display: flex; flex-direction: column; gap: 14px; }
.dt-section-compact { margin-top: 20px; }
.dt-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.dt-h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.dt-h2-sub { margin: 3px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); max-width: 640px; }
.dt-inline-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(288px, 1fr)); gap: 12px; }
.dt-card {
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  transition: border-color .15s ease, background .15s ease;
}
.dt-provider-card {
  display: flex; flex-direction: column; gap: 14px;
  min-height: 158px; padding: 16px; cursor: pointer;
}
.dt-provider-card:hover { border-color: var(--dsw-alias-border-l3); background: color-mix(in srgb, var(--dsw-alias-label-primary) 2%, var(--dsw-alias-bg-layer-1)); }
.dt-card-open {
  display: flex; flex-direction: column; gap: 14px; flex: 1;
  padding: 0; border: none; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dt-card-open:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 4px; border-radius: 8px; }
.dt-card-top { display: flex; align-items: flex-start; gap: 12px; }
.dt-card-mark {
  width: 34px; height: 34px; border-radius: 10px; flex: none;
  display: grid; place-items: center;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
}
.dt-card-text { display: flex; flex-direction: column; min-width: 0; }
.dt-card-name { display: block; font-size: 14.5px; line-height: 21px; font-weight: 600; }
.dt-card-desc { display: block; margin-top: 2px; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dt-card-meta { display: flex; align-items: center; gap: 8px; margin-top: auto; }
.dt-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dt-card-action {
  display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  font-size: 12.5px; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-button-elevated-fill); cursor: pointer;
}
.dt-card-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dt-arrow { color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1; }
.dt-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.dt-status > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-status-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--dsw-alias-state-idle-primary); }
.dt-status-connected .dt-status-dot { background: var(--dsw-alias-state-success-primary); }
.dt-status-connected { color: var(--dsw-alias-label-secondary); }
.dt-status-connecting .dt-status-dot { background: var(--dsw-alias-state-warn-primary); }
.dt-status-needs-auth .dt-status-dot, .dt-status-error .dt-status-dot { background: var(--dsw-alias-state-error-primary); }
.dt-status-success .dt-status-dot { background: var(--dsw-alias-state-success-primary); }
.dt-status-info .dt-status-dot { background: var(--dsw-alias-state-business-primary); }
.dt-status-error { color: var(--dsw-alias-state-error-primary); }
.dt-chip {
  display: inline-flex; align-items: center; height: 20px; padding: 0 7px;
  border-radius: 6px; font-size: 11.5px; line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dt-muted { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.dt-grow { flex: 1; min-width: 0; }
.dt-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-mono { font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12.5px; }
.dt-break { overflow-wrap: anywhere; }
.dt-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; line-height: 20px; cursor: pointer;
  transition: background .12s ease, border-color .12s ease, opacity .12s ease;
  white-space: nowrap;
}
.dt-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dt-btn:disabled { opacity: .5; cursor: default; }
.dt-btn-primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: var(--dsw-alias-label-primary-foreground); }
.dt-btn-primary:hover { background: var(--dsw-alias-button-primary-hover); }
.dt-btn-danger { color: var(--dsw-alias-state-error-primary); }
.dt-btn-danger:hover { background: var(--dsw-alias-interactive-bg-hover-danger); }
.dt-btn-sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.dt-icon-btn {
  width: 28px; height: 28px; display: grid; place-items: center;
  border: none; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;
}
.dt-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dt-switch {
  position: relative; width: 36px; height: 20px; flex: none;
  border: none; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-state-idle-primary);
  transition: background .15s ease;
}
.dt-switch::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--dsw-alias-switch-thumb, #fff);
  box-shadow: 0 1px 2px rgba(0,0,0,.18);
  transition: transform .15s ease;
}
.dt-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dt-switch[aria-checked="true"]::after { transform: translateX(16px); }
.dt-switch:disabled { opacity: .45; cursor: default; }
.dt-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dt-search {
  display: flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 10px; min-width: 230px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-tertiary);
}
.dt-search:focus-within { border-color: var(--dsw-alias-border-l4); }
.dt-search input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px;
}
.dt-search input::placeholder { color: var(--dsw-alias-label-tertiary); }
.dt-detail { display: flex; flex-direction: column; gap: 18px; }
.dt-back {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
  height: 26px; padding: 0 2px; border: none; background: none;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12.5px; cursor: pointer;
}
.dt-back:hover { color: var(--dsw-alias-label-primary); }
.dt-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.dt-detail-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.dt-detail-mark {
  width: 56px; height: 56px; border-radius: 15px; flex: none;
  display: grid; place-items: center;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
}
.dt-detail-name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dt-detail-name { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; }
.dt-detail-desc { margin: 2px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dt-detail .dt-tabs { margin-top: 2px; }
.dt-detail-body { padding-top: 2px; }
.dt-overview { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(272px, 1fr); gap: 14px; align-items: start; }
.dt-overview-main, .dt-overview-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.dt-panel {
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
}
.dt-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.dt-panel-title { margin: 0; font-size: 13.5px; line-height: 20px; font-weight: 600; }
.dt-panel-strong { font-size: 13.5px; line-height: 20px; font-weight: 500; }
.dt-panel-sub { margin: 0; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dt-panel-icon {
  width: 34px; height: 34px; border-radius: 10px; flex: none;
  display: grid; place-items: center; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1);
}
.dt-panel-row { flex-direction: row; align-items: center; gap: 12px; }
.dt-panel-actions { display: flex; }
.dt-panel-actions .dt-btn { flex: 1; }
.dt-kv { display: flex; flex-direction: column; gap: 0; margin: 0; }
.dt-kv-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dt-kv-row:last-child { border-bottom: none; }
.dt-kv dt { margin: 0; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-secondary); flex: none; }
.dt-kv dd { margin: 0; font-size: 12.5px; line-height: 18px; text-align: right; min-width: 0; }
.dt-capabilities { display: flex; flex-direction: column; gap: 7px; margin: 0; padding: 0; list-style: none; }
.dt-capabilities li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; line-height: 18px; }
.dt-cap-check {
  width: 16px; height: 16px; border-radius: 50%; flex: none;
  display: grid; place-items: center; color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);
}
.dt-stack { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dt-danger-zone {
  display: flex; align-items: center; justify-content: space-between; gap: 18px;
  margin-top: 22px; padding: 16px 18px; border: 1px solid color-mix(in srgb, #d33b3b 24%, var(--dsw-alias-border-l2));
  border-radius: var(--dsw-radius-lg); background: color-mix(in srgb, #d33b3b 4%, var(--dsw-alias-bg-layer-1));
}
.dt-danger-title { font-size: 12.5px; line-height: 18px; font-weight: 600; color: #d33b3b; }
.dt-danger-text { margin: 3px 0 0; max-width: 650px; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
@media (max-width: 620px) { .dt-danger-zone { align-items: flex-start; flex-direction: column; } }
.dt-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dt-toolbar-wrap { flex-wrap: wrap; }
.dt-table-wrap { border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); overflow: hidden; overflow-x: auto; background: var(--dsw-alias-bg-layer-1); }
.dt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dt-table th {
  padding: 9px 12px; text-align: left; font-size: 11.5px; font-weight: 500; letter-spacing: .01em;
  color: var(--dsw-alias-label-tertiary); border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent);
}
.dt-table td { padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); vertical-align: middle; }
.dt-table tr:last-child td { border-bottom: none; }
.dt-table tbody tr:hover td { background: var(--dsw-alias-interactive-bg-hover); }
.dt-table-compact td, .dt-table-compact th { padding: 7px 10px; }
.dt-col-status { width: 176px; }
.dt-table-empty { text-align: center; color: var(--dsw-alias-label-tertiary); padding: 26px 12px !important; font-size: 12.5px; }
.dt-td-desc { color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 18px; max-width: 520px; }
.dt-table td .dt-mono { overflow-wrap: anywhere; }
.dt-tool-link { border: none; background: none; padding: 0; font: inherit; color: var(--dsw-alias-link); cursor: pointer; text-align: left; }
.dt-tool-link:hover { text-decoration: underline; }
.dt-tool-link .dt-mono { white-space: nowrap; }
.dt-tool-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 3px; }
.dt-toggle-cell { display: flex; align-items: center; justify-content: flex-end; gap: 9px; }
.dt-tools-layout { display: grid; grid-template-columns: 216px minmax(0, 1fr); gap: 20px; align-items: start; }
.dt-provider-list { display: flex; flex-direction: column; gap: 2px; padding: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.dt-provider-list-label { padding: 6px 8px 8px; font-size: 11.5px; font-weight: 500; color: var(--dsw-alias-label-tertiary); }
.dt-provider-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 7px 9px; border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.dt-provider-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dt-provider-item[aria-current="true"] { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); font-weight: 500; }
.dt-provider-item-mark { display: inline-flex; width: 20px; justify-content: center; }
.dt-tool-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.dt-tool-head-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dt-tool-head-name { font-size: 14px; line-height: 20px; font-weight: 600; }
.dt-error-text { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }
.dt-success-text { color: var(--dsw-alias-state-success-primary); font-size: 12px; line-height: 18px; font-weight: 500; }
.dt-profile-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;
  padding: 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
}
.dt-profile-label { grid-column: 1 / -1; font-size: 11.5px; font-weight: 500; color: var(--dsw-alias-label-tertiary); }
.dt-profile { display: flex; flex-direction: column; gap: 5px; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); }
.dt-profile-title { font-size: 13px; line-height: 19px; font-weight: 600; }
.dt-profile-desc { font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); flex: 1; }
.dt-profile .dt-btn { align-self: flex-start; margin-top: 4px; }
.dt-level { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 6px; font-size: 11.5px; }
.dt-level-read { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-interactive-bg-hover); }
.dt-level-write { color: var(--dsw-alias-state-warn-label); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent); }
.dt-level-dangerous { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
.dt-select-wrap { position: relative; display: inline-flex; align-items: center; }
.dt-select-wrap > svg { position: absolute; right: 8px; pointer-events: none; color: var(--dsw-alias-label-tertiary); }
.dt-select {
  appearance: none; height: 30px; padding: 0 26px 0 9px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12.5px; cursor: pointer;
}
.dt-select-inline { width: 100%; }
.dt-select-inline .dt-select { width: 100%; }
.dt-note { margin: 0; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-tertiary); }
.dt-provider-inline { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; }
.dt-activity-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.dt-activity-row { border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dt-activity-row:last-child { border-bottom: none; }
.dt-activity-main {
  display: flex; align-items: flex-start; gap: 12px; width: 100%;
  padding: 12px 14px; border: none; background: transparent; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
}
.dt-activity-main:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dt-activity-mark {
  width: 30px; height: 30px; border-radius: 9px; flex: none;
  display: grid; place-items: center; background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
}
.dt-activity-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dt-activity-top { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.dt-activity-tool { font-weight: 500; }
.dt-activity-sep { color: var(--dsw-alias-label-dimmed); }
.dt-activity-summary { font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dt-activity-meta { display: flex; align-items: center; gap: 6px; }
.dt-activity-detail { padding: 0 14px 14px 56px; display: flex; flex-direction: column; gap: 10px; }
.dt-activity-block { display: flex; flex-direction: column; gap: 5px; }
.dt-activity-block-label { font-size: 11.5px; font-weight: 500; color: var(--dsw-alias-label-tertiary); }
.dt-activity-block pre, .dt-result {
  margin: 0; padding: 10px 12px; max-height: 260px; overflow: auto;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px; line-height: 17px; white-space: pre-wrap; overflow-wrap: anywhere;
}
.dt-result-error { color: var(--dsw-alias-state-error-primary); }
.dt-confirm { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dt-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  padding: 42px 20px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg);
  color: var(--dsw-alias-label-tertiary); text-align: center;
}
.dt-empty-title { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dt-empty-body { font-size: 12px; line-height: 18px; }
.dt-notice {
  position: sticky; top: 8px; z-index: 30;
  margin-bottom: 14px; padding: 9px 12px; border-radius: 9px; font-size: 12.5px; line-height: 18px;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .10);
}
.dt-notice-error { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent); }
.dt-notice-success { color: var(--dsw-alias-label-secondary); }
.dt-loading { display: flex; align-items: center; justify-content: center; gap: 9px; padding: 60px 0; color: var(--dsw-alias-label-tertiary); font-size: 13px; }
.dt-spinner {
  width: 14px; height: 14px; border-radius: 50%; flex: none;
  border: 2px solid var(--dsw-alias-border-l3); border-top-color: var(--dsw-alias-label-secondary);
  animation: dt-spin .7s linear infinite;
}
@keyframes dt-spin { to { transform: rotate(360deg); } }
.dt-backdrop {
  position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center;
  padding: 24px; background: color-mix(in srgb, #000 34%, transparent);
}
.dt-modal {
  width: min(540px, 100%); max-height: min(84vh, 760px); overflow: auto;
  padding: 18px; border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 18px 48px rgba(0,0,0,.22);
}
.dt-modal-wide { width: min(760px, 100%); }
.dt-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dt-modal-title { font-size: 15px; line-height: 22px; font-weight: 600; }
.dt-modal-title-tool { display: inline-flex; align-items: center; gap: 8px; }
.dt-modal-sub { margin-top: 2px; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dt-modal-body { margin-top: 14px; }
.dt-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.dt-form { display: flex; flex-direction: column; gap: 12px; }
.dt-form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.dt-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.dt-field-wide { grid-column: 1 / -1; }
.dt-field-label { display: flex; align-items: center; gap: 5px; font-size: 12.5px; line-height: 18px; font-weight: 500; }
.dt-field-type { font-weight: 400; font-size: 11.5px; color: var(--dsw-alias-label-tertiary); }
.dt-field-hint { font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.dt-required { color: var(--dsw-alias-state-error-primary); }
.dt-input {
  width: 100%; height: 34px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px;
}
.dt-input:focus { outline: none; border-color: var(--dsw-alias-border-l4); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.dt-textarea { height: auto; padding: 8px 10px; resize: vertical; min-height: 64px; }
.dt-token-guide {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  padding: 0 12px; background: var(--dsw-alias-bg-layer-2);
}
.dt-token-guide summary {
  display: flex; align-items: center; gap: 6px; padding: 10px 0;
  font-size: 12.5px; font-weight: 500; cursor: pointer; list-style: none;
}
.dt-token-guide summary::-webkit-details-marker { display: none; }
.dt-token-guide summary::before { content: '+'; width: 10px; color: var(--dsw-alias-label-tertiary); }
.dt-token-guide[open] summary::before { content: '−'; }
.dt-token-guide ol { margin: 0 0 10px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.dt-token-guide li { font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
.dt-token-guide a { display: inline-block; margin: 0 0 10px; }
.dt-scopes { display: flex; flex-direction: column; gap: 6px; }
.dt-scopes-label { font-size: 12px; line-height: 18px; font-weight: 500; }
.dt-scope-list { display: flex; flex-wrap: wrap; gap: 5px; }
.dt-scope {
  padding: 2px 6px; border-radius: 5px; font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 11px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-interactive-bg-hover);
}
.dt-link { color: var(--dsw-alias-link); font-size: 12.5px; line-height: 18px; text-decoration: none; }
.dt-link:hover { text-decoration: underline; }
.dt-oauth-phase {
  display: flex; align-items: center; gap: 9px; padding: 10px 12px;
  border-radius: 8px; font-size: 12.5px; line-height: 18px;
  color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2);
}
.dt-oauth-url {
  display: block; max-height: 58px; overflow: auto; padding: 7px 9px;
  border-radius: 7px; font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-2); overflow-wrap: anywhere; text-decoration: none;
}
.dt-local-steps { display: flex; flex-direction: column; gap: 6px; margin: 0 0 14px; padding-left: 20px; font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dt-local-endpoint { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; margin-bottom: 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); }
.dt-local-endpoint code { font-family: var(--ds-font-family-code, ui-monospace, monospace); font-size: 12px; }
.dt-dialog-intro, .dt-dialog-body { margin: 0 0 14px; font-size: 12.5px; line-height: 19px; color: var(--dsw-alias-label-secondary); }
.dt-dialog-note { margin: 2px 0 0; font-size: 11.5px; line-height: 17px; color: var(--dsw-alias-label-tertiary); }
.dt-advanced { display: flex; flex-direction: column; gap: 10px; }
.dt-link-btn {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 4px;
  border: none; background: none; padding: 0; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12.5px; cursor: pointer;
}
.dt-link-btn:hover { color: var(--dsw-alias-label-primary); }
.dt-form-error {
  padding: 8px 10px; border-radius: 7px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);
}
.dt-inline-warning {
  padding: 8px 10px; border-radius: 7px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-state-warn-label);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
}
.dt-tool-detail { display: flex; flex-direction: column; gap: 16px; }
.dt-tool-desc { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dt-tool-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dt-tool-section { display: flex; flex-direction: column; gap: 9px; }
.dt-tool-section-title { margin: 0; font-size: 12.5px; line-height: 18px; font-weight: 600; }
.dt-result-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.dt-probe { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: 9px; font-size: 13px; }
.dt-probe-running { flex-direction: row; align-items: center; gap: 9px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
.dt-probe-ok { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent); }
.dt-probe-fail { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
.dt-error-panel { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 24px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); }
.dt-error-title { font-size: 14px; font-weight: 600; }
.dt-visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
@media (max-width: 900px) {
  .dt-overview { grid-template-columns: 1fr; }
  .dt-tools-layout { grid-template-columns: 1fr; }
  .dt-provider-list { flex-direction: row; overflow-x: auto; }
  .dt-provider-item { width: auto; flex: none; }
  .dt-provider-list-label { display: none; }
}
@media (max-width: 620px) {
  .dt-shell { padding: 0 16px; }
  .dt-page { padding-top: calc(var(--dsh-frame-top-clearance, 0px) + 18px); }
  .dt-detail-head { flex-direction: column; }
  .dt-col-status { width: 132px; }
  .dt-toolbar { flex-wrap: wrap; }
  .dt-search { min-width: 0; width: 100%; }
}
`

    // ── plugin ──────────────────────────────────────────────────────────────

    function SidebarIcon({ size = 20, active = false }) {
      return h('span', {
        style: {
          display: 'inline-flex', width: size, height: size,
          alignItems: 'center', justifyContent: 'center',
          color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
        },
      }, h(CubeMark, { size: size - 2 }))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-devtools: dictionaries')
        const t = ctx.locale.bind(NS)

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, DevToolsPage))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 10,
          label: () => t('panel.title'),
          locale: NS,
        }, SidebarIcon))
      },
    }
  },
})
