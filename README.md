# 🎶 Solara（光域）

> 🌐 由轻量后端服务支撑的现代化网页音乐播放器，整合多种音乐聚合接口，覆盖搜索、播放与音频下载全流程。

![Review-ezgif com-optimize](https://github.com/user-attachments/assets/487157de-bf71-4bc9-9e49-16a4f0a14472)
| | | |
|:--:|:--:|:--:|
| <img src="https://github.com/user-attachments/assets/7fcfd485-bcd4-46f9-887a-0a972dce3be3" height="700"/> | <img src="https://github.com/user-attachments/assets/bb092569-0a7f-47f6-b7e9-c07ea56949cf" height="700"/> | <img src="https://github.com/user-attachments/assets/02b830e3-292f-4880-91f2-86ec818b877a" height="700"/> |


## 🤝 参与贡献
感谢 GD音乐台(music.gdstudio.xyz)提供的免费API

感谢 来自Linux.do 牛就是牛@ufoo 大佬 https://linux.do/t/topic/942415 提供的灵感


## 🌟 主要特性

- 🎨 主题美学：内置亮/暗模式与玻璃拟态界面，根据当前曲目封面自动取色渲染沉浸式背景，具备沉浸体验。
- 📱  竖屏移动端：全新竖屏布局匹配移动端手势与屏幕比例，按钮、列表与歌词均针对单手操作优化。
- 🔍 跨站曲库检索：一键切换数据源，支持分页浏览并批量导入播放队列。
- 📻 队列管理灵活：新增、删除、清空操作即时生效，并自动持久化到浏览器 localStorage。
- ❤️ 收藏列表：搜索结果与播放列表均可一键收藏，收藏列表拥有独立的播放进度、播放模式与批量操作面板。
- 🔁 丰富的播放模式：列表循环、单曲循环与随机播放随手切换，记忆上次偏好。
- 📝 动态歌词视图：逐行滚动高亮，当前行自动聚焦，手动滚动后短暂锁定视图。
- 🔄 列表导入导出：支持播放队列与收藏列表统一导入/导出，可一键迁移或恢复收藏歌曲并同步到播放队列。
- 📥 多码率下载：可挑选 128K / 192K / 320K / FLAC 等品质并直接获取音频文件。
- ☁️ 轻量后端代理：通过 Cloudflare Pages Functions 统一聚合各数据源并处理音频跨域。
- 🔒 锁屏播放控制：锁屏界面自动显示专辑封面与播放控件，无需解锁即可进行播放控制。
- 🛠️ 调试控制台：按下 Ctrl + D 呼出实时日志面板，便于排查接口或交互异常。
## 🧭 探索雷达
- 探索雷达会在「流行、摇滚、古典音乐、民谣、电子、爵士、说唱、乡村、蓝调、R&B、金属、嘻哈、轻音乐」等分类中随机挑选关键词，自动为播放列表补充新歌。
## 📌 项目来源
本项目基于原仓库 [akudamatata/Solara](https://github.com/akudamatata/Solara) 进行 Docker 化改造，
保留原有播放器功能，并补充了 Node/Docker 部署方式。
## 🎶 Docker部署
- 飞牛docker商店搜:dgg788/solara
- docker pull dgg788/solara:latest
- docker run -d \
--name solara \
-p 3003:3001 \
-e PORT=3001 \
-e PASSWORD="" \
--restart unless-stopped \
dgg788/solara:latest

- 默认不带密码为空，如需带密码：PASSWORD="123456"
```

## 📄 许可证
本项目采用 CC BY-NC-SA 协议，禁止任何商业化行为，任何衍生项目必须保留本项目地址并以相同协议开源。
