# 线上网站

- GitHub 仓库：https://github.com/17818665698gugeyouxiang-arch/bbbbp
- 网站：https://17818665698gugeyouxiang-arch.github.io/bbbbp/
- Supabase 项目：wevmotwnnzknfclloeyh
- 分支：master；GitHub Pages 使用 GitHub Actions。

登录邮箱账号后，训练、错题、专项练习、作答和照片同步到该账号。游客记录只在当前浏览器保存，与账号记录隔离。换账号不会把前一个账号的记录上传给后一个账号。

## 迁移本机旧记录

1. 在原本机网站 http://127.0.0.1:4173/ 的“数据与备份”导出 ZIP。
2. 在线上网站登录自己的账号，在“数据与备份”导入同一个 ZIP。
3. 等待显示“已同步到个人云端”，再在其他设备登录同一账号。

本机服务、数据库名及 data 文件夹保持原样。个人记录、照片和 ZIP 不提交 GitHub。

## 发布

`scripts/build-pages.mjs` 构建到 `output/pages`，本机 `dist` 不被覆盖。两个大 PDF 以无损分片保存在题库目录，构建时验证 SHA-256 并还原；网页下载的仍是完整 PDF。

向 master 推送已审核的源码、public 题库和部署配置会触发 `.github/workflows/deploy-pages.yml`。不要使用 `git add .`，不要提交 data、runtime、tmp、output、环境变量文件、数据库密码或管理密钥。

前端仅包含公开 Supabase URL 和 publishable key。新表使用 RLS；照片存储为私有桶，仅允许对应用户读取或新增自己的文件。旧游戏注册函数仅增加 study_app=bpho-study 的跳过分支，其余行为不变，旧表数据保留。

Supabase 免费项目仍可能因平台的闲置策略暂停；这与本机服务进程无关。需要时从 Supabase 控制台恢复项目，不必删除任何记录。
