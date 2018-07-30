import * as path from 'path';
import * as url from 'url';
import * as xml2js from 'xml2js-es6-promise';
import * as Sequelize from 'sequelize';
import * as fs from 'fs-extra-promise';
import got = require('got');
import millisecond = require('millisecond');

const ms = (time: string | number) => millisecond(time) as number;

interface YandereOption {
    serverBaseAddress: string,
    dataPath: string,
    dbPath: string
}

interface PostInfo {
    id: string,
    md5: string,
    sample_url: string
}

interface PostAttribute {
    postId?: number
    filePath?: string
    isRead?: boolean
    createdAt?: Date,
    updatedAt?: Date
}

interface Post extends Sequelize.Instance<PostAttribute>, PostAttribute {
    getActualFilePath: () => string
}

interface PostModel extends Sequelize.Model<Post, PostAttribute> {
    prototype?: any
}

interface TaskCallback { (err: Error, result: { isBusy?: boolean }) }

const FETCH_POST_INFO_LIMIT = 100;
const FETCH_POST_LIMIT = 10;
const READ_POST_FILE_LIFETIME = ms('3d');
const POST_LIFETIME = ms('100d');
const DELETING_LIMIT = 100;
const MIN_INACTIVE_DURATION = ms('15d')

export = class Yandere {
    private serverBaseAddress: string;
    private dataPath: string;
    private imageDataPath: string;
    private dbPath: string;
    private orm: Sequelize.Sequelize;
    private Post: PostModel;
    private postsToFetch: PostInfo[] = [];
    private isUnderFetchingPosts: boolean = false;

    constructor (option: YandereOption) {
        this.serverBaseAddress = option.serverBaseAddress;
        this.dataPath = option.dataPath;
        this.imageDataPath = path.join(this.dataPath, 'public', 'images');
        this.dbPath = option.dbPath;

        this.orm = new Sequelize(null, null, null, {
            dialect: 'sqlite',
            logging: process.env.NODE_ENV === 'production' ? false : console.log,
            storage: this.dbPath,
            operatorsAliases: false
        });

        const imageDataPath = this.imageDataPath;
        this.Post = this.orm.define<Post, PostAttribute>('post', {
            postId: { type: Sequelize.INTEGER, allowNull: false, unique: true, primaryKey: true },
            filePath: { type: Sequelize.STRING },
            isRead: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
        });
        this.Post.prototype.getActualFilePath = function () {
            return this.filePath ? path.join(imageDataPath, this.filePath) : this.filePath;
        }
    }

    install (option, callback: { (err: Error) }) {
        Promise.all([
            fs.ensureDirAsync(path.dirname(this.dbPath)),
            fs.ensureDirAsync(this.imageDataPath)
        ])
        .then(() => this.Post.sync())
        .then(() => callback(null))
        .catch(callback)
    }

    private isUserInactive () {
        return this.Post.findOne({
            where: { isRead: true },
            order: [['updatedAt', 'DESC']]
        })
        .then((lastReadPost: Post) => {
            if (lastReadPost) return lastReadPost.updatedAt.getTime() + MIN_INACTIVE_DURATION < Date.now();

            return this.Post.findOne({ order: [['updatedAt']]})
            .then((oldestPost: Post) => oldestPost && oldestPost.updatedAt.getTime() + MIN_INACTIVE_DURATION < Date.now())
        })
    }

    private async fetchPostInfos (page?: number, limit?: number) {
        const remoteURL = `${this.serverBaseAddress}/post.xml?limit=${limit || FETCH_POST_INFO_LIMIT}&page=${page || 1}`;
        if (process.env.NODE_ENV === 'development') console.log(remoteURL);
        const { body } = await got(remoteURL);
        const result = await xml2js(body, { explicitArray: false, mergeAttrs: true });
        return result.posts.post as PostInfo[];
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

            const fetch = () => {
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

    private fetchPost (postInfo: PostInfo) {
        const postId = Number(postInfo.id);
        const ext = path.extname(url.parse(postInfo.sample_url).pathname);
        const filePath = postInfo.md5 + ext;
        return new Promise((resolve, reject) => {
            const localPath = path.join(this.imageDataPath, filePath);
            if (process.env.NODE_ENV === 'development') console.log(postInfo.sample_url);
            got.stream(postInfo.sample_url, {
                timeout: ms('1m')
            }).on('error', reject)
            .pipe(fs.createWriteStream(localPath)).on('error', reject)
            .on('finish', () => resolve());
        })
        .then(() => this.Post.create({ postId, filePath }));
    }

    fetchPosts (option, callback: TaskCallback) {
        if (this.isUnderFetchingPosts) return process.nextTick(callback, null, null);

        this.isUnderFetchingPosts = true;
        let postsToFetch = this.postsToFetch;
        let fetchedPostCount = 0;

        const fetch = () => {
            if (fetchedPostCount >= FETCH_POST_LIMIT) return Promise.resolve();

            const postInfo: PostInfo = postsToFetch[0];
            if (!postInfo) return Promise.resolve();

            return new Promise(resolve => setTimeout(resolve, ms('5s')))
            .then(() => this.fetchPost(postInfo))
            .then(() => {
                const pos = postsToFetch.indexOf(postInfo);
                if (pos >= 0) postsToFetch.splice(pos, 1);
                fetchedPostCount += 1;
                return fetch();
            })
        };

        fetch()
        .then(() => {
            if (postsToFetch.length > 0) return null; // remainings will be continued at next function call

            return this.isUserInactive()
            .then((isInactive) => {
                if (isInactive) return null;

                return this.fetchNewPostInfos()
                .then((postInfos: PostInfo[]) => {
                    if (postInfos.length === 0) return null;

                    postsToFetch = postInfos.sort((a, b) => Number(a.id) - Number(b.id));
                    return fetch()
                })
            })
        })
        .then(() => {
            this.postsToFetch = postsToFetch;
            this.isUnderFetchingPosts = false;
            process.nextTick(callback, null, { isBusy: postsToFetch.length > 0 });
        })
        .catch(err => {
            this.isUnderFetchingPosts = false;
            callback(err, null);
        })
    }

    private deletePostFileData (post: Post) {
        const filePath = post.getActualFilePath();
        if (!filePath) return Promise.resolve();
        return fs.removeAsync(filePath)
        .then(() => post.update({ filePath: null}, null))
    }

    private async deletePostData (post: Post) {
        await this.deletePostFileData(post);
        await post.destroy();
    }

    deleteOldData (option, callback: TaskCallback) {
        let isBusy: boolean;
        const now = Date.now();
        const removePostBeforeCreatedAt = now - POST_LIFETIME;
        this.Post.findAll({
            where: {
                [Sequelize.Op.or]: [
                    {
                        isRead: true,
                        filePath: { [Sequelize.Op.ne]: null },
                        updatedAt: { [Sequelize.Op.lt]: new Date(Date.now() - READ_POST_FILE_LIFETIME) }
                    },
                    {
                        createdAt: { [Sequelize.Op.lt]: new Date(removePostBeforeCreatedAt) }
                    }
                ]
            },
            limit: DELETING_LIMIT
        })
        .then(async (posts: Post[]) => {
            isBusy = posts.length >= DELETING_LIMIT;
            for (const post of posts) {
                if (Number(post.createdAt) < removePostBeforeCreatedAt) await this.deletePostData(post);
                else await this.deletePostFileData(post);
            }
        })
        .then(() => process.nextTick(callback, null, { isBusy }))
        .catch(err => callback(err, null));
    }

    getPosts (option: {
        page?: number
        pagingUnit?: number
        fromDate?: Date
    }, callback) {
        const page = option.page || 0;
        const pagingUnit = option.pagingUnit || 32;
        const offset = pagingUnit * page;
        const where = { isRead: false } as {
            isRead: boolean
            createdAt?: any
        };
        if (option.fromDate) where.createdAt = { [Sequelize.Op.gte]: option.fromDate };
        this.Post.findAll({ where,
            order: ['postId'],
            offset,
            limit: pagingUnit
        })
        .then((posts: Post[]) => {
            const postInfos = posts.map(post => ({
                postId: post.postId,
                src: post.filePath,
                filePath: post.getActualFilePath(),
                updatedAt: post.updatedAt,
            }));
            process.nextTick(callback, null, { postInfos });
        })
        .catch(callback);
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
