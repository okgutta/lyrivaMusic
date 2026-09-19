/// <reference types="node" />
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UpdateReleaseNotes from "./UpdateReleaseNotes.tsx";

function render(notes: string) {
  return renderToStaticMarkup(createElement(UpdateReleaseNotes, { notes }));
}

const formatted = render(
  [
    "## 新版本",
    "修复 **逐字歌词** 与 `timing`。",
    "这一行属于同一段落。",
    "",
    "- 支持 [发布说明](https://github.com/okgutta/lyrivaMusic/releases)",
    "- __设置__ 面板",
    "  连续说明",
    "",
    "3. 下载更新",
    "4. 重新加载",
    "",
    "### 完成 ###",
  ].join("\r\n")
);
assert.ok(formatted.startsWith('<div class="sl-update-notes-content"><h3>新版本</h3>'));
assert.ok(
  formatted.includes("<strong>逐字歌词</strong> 与 <code>timing</code>。 这一行属于同一段落。")
);
assert.ok(
  formatted.includes(
    '<ul><li>支持 <a href="https://github.com/okgutta/lyrivaMusic/releases" target="_blank" rel="noopener noreferrer">发布说明</a></li>'
  )
);
assert.ok(formatted.includes("<li><strong>设置</strong> 面板 连续说明</li>"));
assert.ok(formatted.includes('<ol start="3"><li>下载更新</li><li>重新加载</li></ol>'));
assert.ok(formatted.includes("<h3>完成</h3>"));

const commands = render(
  [
    "安装命令：",
    "```powershell",
    "spicetify config extensions lyriva.js",
    "spicetify apply",
    "",
    'Write-Output "<script>**literal**</script>"',
    "```",
    "完成后重新打开 Spotify。",
  ].join("\r\n")
);
assert.ok(
  commands.includes(
    "<p>安装命令：</p><pre><code>spicetify config extensions lyriva.js\nspicetify apply\n\n" +
      "Write-Output &quot;&lt;script&gt;**literal**&lt;/script&gt;&quot;\n</code></pre>" +
      "<p>完成后重新打开 Spotify。</p>"
  ),
  "Fenced commands retain their line breaks and literal content"
);
assert.ok(!commands.includes("<script>") && !commands.includes("<strong>"));
assert.ok(render("~~~sh\nfirst\nsecond\n~~~").includes("<pre><code>first\nsecond\n</code></pre>"));
assert.ok(render("```\nunclosed\nlast").includes("<pre><code>unclosed\nlast</code></pre>"));

const unsafe = render(
  "<script>alert(1)</script> <img src=x onerror=alert(1)>\n\n" +
    "[执行](javascript:alert) [数据](data:text/html,test) [不安全](http://example.com) " +
    "[相对](//example.com) ![封面文字](https://example.com/tracker.png)"
);
assert.ok(unsafe.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
assert.ok(!/<(?:script|img|a)\b/.test(unsafe));
assert.ok(unsafe.includes("执行 数据 不安全 相对 封面文字"));
assert.ok(!unsafe.includes("tracker.png"));

assert.ok(
  render('[链接](https://example.com/path "描述")').includes('href="https://example.com/path"')
);
assert.ok(render("[无效](https://[broken)").includes("<p>无效</p>"));
assert.ok(render("`<b>代码</b>`").includes("<code>&lt;b&gt;代码&lt;/b&gt;</code>"));
assert.ok(render("![<script>](https://example.com/image)").includes("&lt;script&gt;"));
assert.equal(render("\n\r\n"), '<div class="sl-update-notes-content"></div>');
console.log("Release notes Markdown rendering and safety tests passed");
