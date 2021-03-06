import * as path from 'path';
import * as url from 'url';
import * as xml2js from 'xml2js';
import * as Sequelize from 'sequelize';
import * as fs from 'fs-extra';
import got = require('got');
import millisecond = require('millisecond');

const ms = (time: string | number) => millisecond(time) as number;

interface YandereOption {
    serverBaseAddress: string,
    dataPath: string,
    dbPath: string
    maxFetchingFileCount?: number
}

interface PostInfo {
    id: string
    md5: string
    sample_url: string
    created_at: number
}

class Post extends Sequelize.Model {
    public static imageDataPath: string

    public postId!: number
    public md5!: string
    public remoteURL!: string
    public postCreatedAt!: Date
    public filePath!: string | null
    public isRead!: boolean
    public readonly createdAt!: Date
    public readonly updatedAt!: Date

    public getActualFilePath () {
        return this.filePath ? path.join(Post.imageDataPath, this.filePath) : this.filePath;
    }
}

interface TaskResult {
    isBusy?: boolean
}
interface TaskCallback { (err: Error, result: TaskResult | null) }

const FETCH_POST_INFO_LIMIT = 100;
const FETCH_POST_LIMIT = 10;
const READ_POST_FILE_LIFETIME = ms('3d');
const POST_LIFETIME = ms('100d');
const DELETING_LIMIT = 100;
const MIN_INACTIVE_DURATION = ms('15d')

export class Yandere {
    private serverBaseAddress: string;
    private dataPath: string;
    private imageDataPath: string;
    private dbPath: string;
    private maxFetchingFileCount: number;
    private orm: Sequelize.Sequelize;
    private Post: typeof Post;
    private isUnderFetchingPosts: boolean = false;
    private lastPostInfoFetchedAt = 0;

    constructor (option: YandereOption) {
        this.serverBaseAddress = option.serverBaseAddress;
        this.dataPath = option.dataPath;
        this.imageDataPath = path.join(this.dataPath, 'public', 'images');
        this.dbPath = option.dbPath;
        this.maxFetchingFileCount = option.maxFetchingFileCount || 5000;

        this.orm = new Sequelize.Sequelize(null!, null!, null!, {
            dialect: 'sqlite',
            logging: process.env.NODE_ENV === 'production' ? false : console.log,
            storage: this.dbPath,
        });

        Post.init({
            postId: { type: Sequelize.INTEGER, allowNull: false, unique: true, primaryKey: true },
            md5: { type: Sequelize.STRING, allowNull: false },
            remoteURL: { type: Sequelize.STRING, allowNull: false },
            postCreatedAt: { type: Sequelize.DATE, allowNull: false },
            filePath: { type: Sequelize.STRING },
            isRead: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
        }, {
            sequelize: this.orm,
            tableName: 'posts'
        });
        Post.imageDataPath = this.imageDataPath;
        this.Post = Post;
    }

    install (option, callback: (err?: Error) => any) {
        Promise.all([
            fs.ensureDir(path.dirname(this.dbPath)),
            fs.ensureDir(this.imageDataPath)
        ])
        .then(() => this.Post.sync())
        .then(() => callback())
        .catch(callback)
    }

    private isUserInactive () {
        return this.Post.findOne({
            where: { isRead: true },
            order: [['updatedAt', 'DESC']]
        })
        .then((lastReadPost: Post) => {
            if (lastReadPost) return lastReadPost.updatedAt.getTime() + MIN_INACTIVE_DURATION < Date.now();

            return this.Post.findOne({ order: ['updatedAt'] })
            .then((oldestPost: Post) => oldestPost && oldestPost.updatedAt.getTime() + MIN_INACTIVE_DURATION < Date.now())
        })
    }

    private async fetchPostInfos (page: number = 1, limit: number = FETCH_POST_INFO_LIMIT) {
        const remoteURL = `${this.serverBaseAddress}/post.xml?limit=${limit}&page=${page}`;
        if (process.env.NODE_ENV === 'development') console.log(remoteURL);
        const { body } = await got(remoteURL);
        const result = await new Promise<{
            posts: {
                post: PostInfo[]
            }
        }>((resolve, reject) => xml2js.parseString(body, { explicitArray: false, mergeAttrs: true }, (err, result) => err ? reject(err) : resolve(result)));
        return result.posts.post;
    }

    private fetchNewPostInfos () {
        return this.Post.findOne({ order: [['postId', 'DESC']] })
        .then((lastPost) => {
            if (!lastPost) return this.fetchPostInfos(); // very begining of fetching. fetching from the last page (not the first page due to too many archived data exists)

            const lastPostId = lastPost.postId;
            const postsToFetch: PostInfo[] = [];
            const postIdsToFetch = new Set<string>();
            let page: number = 1;
            const limit: number = FETCH_POST_INFO_LIMIT;

            const fetch: () => Promise<PostInfo[]> = () => {
                return this.fetchPostInfos(page, limit)
                .then(postList => {
                    const postListOfPage = postList.filter((postInfo) => Number(postInfo.id) > lastPostId && !postIdsToFetch.has(postInfo.id));
                    postsToFetch.push(...postListOfPage);
                    postListOfPage.forEach(postInfo => postIdsToFetch.add(postInfo.id));

                    if (postList.some(postInfo => Number(postInfo.id) <= lastPostId)) return postsToFetch;

                    page += 1;
                    return fetch();
                })
            };
            return fetch();
        });
    }

    private async fetchPost (post: Post) {
        const remoteURL = post.remoteURL;
        const ext = path.extname(url.parse(remoteURL).pathname!);
        const filePath = post.md5 + ext;
        try {
            await new Promise<void>((resolve, reject) => {
                const localPath = path.join(this.imageDataPath, filePath);
                if (process.env.NODE_ENV === 'development') console.log(remoteURL);
                got.stream(remoteURL, { timeout: ms('1m') }).on('error', reject)
                .pipe(fs.createWriteStream(localPath)).on('error', reject)
                .on('finish', () => resolve());
            });
        } catch (e) {
            if (e.statusCode !== 404) throw e;
        }
        await post.update({ filePath });
    }

    private async getFetchedFileCount () {
        return this.Post.count({
            where: {
                isRead: false,
                filePath: { [Sequelize.Op.ne]: null },
            }
        });
    }

    public async fetchPostsAsync (option: {
        skipFileFetching?: boolean
    } = {}): Promise<TaskResult | null> {
        if (await this.isUserInactive()) return null;

        if (this.isUnderFetchingPosts) return null;
        this.isUnderFetchingPosts = true;

        try {
            if (Date.now() - this.lastPostInfoFetchedAt > ms('27m')) {
                const postInfos = await this.fetchNewPostInfos();
                if (postInfos.length > 0) await this.Post.bulkCreate(postInfos.map(postInfo => ({
                    postId: Number(postInfo.id),
                    md5: postInfo.md5,
                    remoteURL: postInfo.sample_url,
                    postCreatedAt: new Date(postInfo.created_at * 1000),
                })));
                this.lastPostInfoFetchedAt = Date.now();
            }

            if (option.skipFileFetching) return null;

            const fetchedFileCount = await this.getFetchedFileCount();
            if (fetchedFileCount >= this.maxFetchingFileCount) return null;

            const posts = await this.Post.findAll({
                where: {
                    isRead: false,
                    filePath: null,
                },
                limit: FETCH_POST_LIMIT
            });
            for (const post of posts) {
                await new Promise(resolve => setTimeout(resolve, ms('5s')));
                await this.fetchPost(post);
            }

            const isBusy = posts.length >= FETCH_POST_LIMIT;
            return { isBusy };
        } finally {
            this.isUnderFetchingPosts = false;
        }
    }

    public fetchPosts (option, callback: TaskCallback) {
        this.fetchPostsAsync(option)
        .then(result => process.nextTick(callback, null, result))
        .catch(err => callback(err, null));
    }

    private deletePostFileData (post: Post) {
        const filePath = post.getActualFilePath();
        if (!filePath) return Promise.resolve();
        return fs.remove(filePath)
        .then(() => post.update({ filePath: null}))
    }

    private async deletePostData (post: Post) {
        await this.deletePostFileData(post);
        await post.destroy();
    }

    private async deleteOldPostFiles (option: {
        limit?: number
    } = {}) {
        const { limit = DELETING_LIMIT } = option;

        const posts = await this.Post.findAll({
            where: {
                isRead: true,
                filePath: { [Sequelize.Op.ne]: null },
                updatedAt: { [Sequelize.Op.lt]: new Date(Date.now() - READ_POST_FILE_LIFETIME) }
            },
            limit
        });
        for (const post of posts) await this.deletePostFileData(post);
        return posts.length;
    }

    private async deleteOldPosts (option: {
        includeNotReadOnes?: boolean
        limit?: number
    } = {}) {
        const { limit = DELETING_LIMIT } = option;

        const where: Sequelize.WhereOptions = {
            updatedAt: { [Sequelize.Op.lt]: new Date(Date.now() - POST_LIFETIME) }
        };
        if (!option.includeNotReadOnes) where.isRead = true;

        const posts = await this.Post.findAll({ where, limit });
        for (const post of posts) await this.deletePostData(post);
        return posts.length;
    }

    public async deleteOldDataAsync (): Promise<TaskResult> {
        let processedCount = await this.deleteOldPostFiles();
        let isBusy = processedCount >= DELETING_LIMIT;
        if (isBusy) return { isBusy };

        const deletePostsIncludingNotReadOnes = await this.isUserInactive();
        processedCount += await this.deleteOldPosts({
            includeNotReadOnes: deletePostsIncludingNotReadOnes,
            limit: DELETING_LIMIT - processedCount
        });

        isBusy = processedCount >= DELETING_LIMIT;
        return { isBusy };
    }

    public deleteOldData (option, callback: TaskCallback) {
        this.deleteOldDataAsync()
        .then(result => process.nextTick(callback, null, result))
        .catch(err => callback(err, null));
    }

    public async getPostsAsync (option: {
        page?: number
        pagingUnit?: number
        fromDate?: Date
    }) {
        const { page = 0, pagingUnit = 32 } = option;
        const offset = pagingUnit * page;
        const where: Sequelize.WhereOptions = {
            isRead: false,
            filePath: { [Sequelize.Op.ne]: null },
        };
        if (option.fromDate) Object.assign(where, {
            createdAt: { [Sequelize.Op.gte]: option.fromDate }
        });
        const posts = await this.Post.findAll({ where,
            order: ['postId'],
            offset,
            limit: pagingUnit
        });

        const postInfos = posts.map(post => ({
            postId: post.postId,
            src: post.filePath,
            filePath: post.getActualFilePath(),
            postCreatedAt: post.postCreatedAt,
            updatedAt: post.updatedAt,
        }));

        return { postInfos };
    }

    public getPosts (option: {
        page?: number
        pagingUnit?: number
        fromDate?: Date
    }, callback) {
        this.getPostsAsync(option)
        .then(result => callback(null, result), callback);
    }

    markRead (option: { postIds: number[] }, callback) {
        this.Post.update({ isRead: true },
        {
            where: {
                postId: { [Sequelize.Op.in]: option.postIds }
            }
        })
        .then(() => process.nextTick(callback, null, null))
        .catch(callback);
    }

    getStats (option, callback) {
        const result: { unreadCount?: number } = {};
        this.Post.count({
            where: {
                isRead: false
            }
        })
        .then((count) => {
            result.unreadCount = count;
            return;
        })
        .then(() => process.nextTick(callback, null, result))
        .catch(callback);
    }
}
