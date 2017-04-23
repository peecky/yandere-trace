import * as path from 'path';
import * as url from 'url';
import * as xml2js from 'xml2js-es6-promise';
import * as Sequelize from 'sequelize';
import * as fs from 'fs-extra-promise';
import * as request from 'request';
import * as rp from 'request-promise';
import ms = require('millisecond');

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
    postId: number,
    filePath: string,
    isRead?: boolean,
    updatedAt?: Date
}

interface Post extends Sequelize.Instance<PostAttribute>, PostAttribute {
    getActualFilePath: { (): string }
}

interface ExternalCallback { (err: Error, result: { isBusy?: boolean }) }

const FETCH_POST_INFO_LIMIT = 35;
const FETCH_POST_LIMIT = 10;
const READ_POST_LIFETIME = ms('3d');
const UNREAD_POST_LIFETIME = ms('100d');
const DELETING_LIMIT = 100;
const MIN_INACTIVE_DURATION = ms('15d')

export = class Yandere {
    private serverBaseAddress: string;
    private dataPath: string;
    private imageDataPath: string;
    private dbPath: string;
    private orm: Sequelize.Sequelize;
    private Post: Sequelize.Model<Post, PostAttribute>;
    private postsToFetch: PostInfo[] = [];
    private isUnderFetchingPosts: boolean = false;

    constructor(option: YandereOption) {
        this.serverBaseAddress = option.serverBaseAddress;
        this.dataPath = option.dataPath;
        this.imageDataPath = path.join(this.dataPath, 'public', 'images');
        this.dbPath = option.dbPath;

        this.orm = new Sequelize(null, null, null, {
            dialect: 'sqlite',
            logging: process.env.NODE_ENV === 'production' ? false : console.log,
            storage: this.dbPath
        });

        const imageDataPath = this.imageDataPath;
        this.Post = this.orm.define<Post, PostAttribute>('post', {
            postId: { type: Sequelize.INTEGER, allowNull: false, unique: true, primaryKey: true },
            filePath: { type: Sequelize.STRING },
            isRead: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
        }, {
            instanceMethods: {
                getActualFilePath: function() {
                    return this.filePath ? path.join(imageDataPath, this.filePath) : this.filePath;
                }
            }
        })
    }

    init(option, callback: { (err: Error) }) {
        Promise.all([
            fs.ensureDirAsync(path.dirname(this.dbPath)),
            fs.ensureDirAsync(this.imageDataPath)
        ])
        .then(() => this.Post.sync())
        .then(() => callback(null))
        .catch(callback)
    }

    private isUserInactive() {
        let isInactive: boolean;
        return this.Post.findOne({ 
            where: { isRead: true },
            order: [['updatedAt', 'DESC']]
        })
        .then((lastReadPost: Post) => {
            if (lastReadPost) {
                isInactive = lastReadPost.updatedAt.getTime() + MIN_INACTIVE_DURATION < Date.now();
                throw null;
            }

            return this.Post.findOne({ order: [['updatedAt']]})
        })
        .then((oldestPost: Post) => {
            isInactive = oldestPost && oldestPost.updatedAt.getTime() + MIN_INACTIVE_DURATION < Date.now();
            return isInactive;
        })
        .catch((err) => err ? Promise.reject(err) : Promise.resolve(isInactive))
    }

    private fetchPostInfos(page?: number, limit?: number) {
        return rp(`${this.serverBaseAddress}/post.xml?limit=${limit || FETCH_POST_INFO_LIMIT}&page=${page || 1}`)
        .then(body => xml2js(body, { explicitArray: false, mergeAttrs: true }))
        .then((result: any) => result.posts.post);
    }

    private fetchNewPostInfos() {
        return this.Post.findOne({ order: [['postId', 'DESC']] })
        .then((lastPost: Post) => {
            if (!lastPost) return this.fetchPostInfos(); // very begining of fetching. fetching from the last page (not the first page due to too many archived data exists)

            const lastPostId = lastPost.postId;
            let postsToFetch: PostInfo[] = [];
            let page: number = 1;
            const limit: number = FETCH_POST_INFO_LIMIT;

            const fetch = () => {
                return this.fetchPostInfos(page, limit)
                .then(postList => {
                    const postListOfPage = postList.filter((postInfo: PostInfo) => Number(postInfo.id) > lastPostId);
                    postsToFetch = postsToFetch.concat(postListOfPage);
                    if (postListOfPage.length < limit) return postsToFetch;

                    page += 1;
                    return fetch();
                })
            };
            return fetch();
        });
    }

    private fetchPost(postInfo: PostInfo) {
        const postId = Number(postInfo.id);
        const ext = path.extname(url.parse(postInfo.sample_url).pathname);
        const filePath = postInfo.md5 + ext;
        return new Promise((resolve, reject) => {
            const localPath = path.join(this.imageDataPath, filePath);
            request(postInfo.sample_url).on('error', reject)
            .pipe(fs.createWriteStream(localPath)).on('error', reject)
            .on('finish', () => resolve());
        })
        .then(() => this.Post.create({ postId, filePath }));
    }

    fetchPosts(option, callback: ExternalCallback) {
        if (this.isUnderFetchingPosts) return process.nextTick(callback, null, null);

        this.isUnderFetchingPosts = true;
        let postsToFetch = this.postsToFetch;

        const finalCallback = (err?) => {
            this.postsToFetch = postsToFetch;
            this.isUnderFetchingPosts = false;
            process.nextTick(callback, err || null, { isBusy: !err && postsToFetch.length > 0 });
        }

        let fetchedPostCount = 0;

        const fetch = () => {
            if (fetchedPostCount >= FETCH_POST_LIMIT) return Promise.resolve();

            const postInfo: PostInfo = postsToFetch[0];
            if (!postInfo) return Promise.resolve();

            return this.fetchPost(postInfo)
            .then(() => {
                postsToFetch.shift();
                fetchedPostCount += 1;
                return fetch();
            })
        };

        fetch()
        .then(() => {
            if (postsToFetch.length > 0) throw null; // remainings will be continued at next function call

            return this.isUserInactive();
        })
        .then((isInactive: boolean) => {
            if (isInactive) throw null;

            return this.fetchNewPostInfos()
        })
        .then((postInfos: PostInfo[]) => {
            if (postInfos.length === 0) throw null;

            postsToFetch = postInfos.sort((a, b) => Number(a.id) - Number(b.id));
            return fetch()
        })
        .then(() => finalCallback())
        .catch(finalCallback)
    }

    private deletePostFileData(post: Post) {
        const filePath = post.getActualFilePath();
        if (!filePath) return Promise.resolve();
        return fs.removeAsync(filePath)
        .then(() => post.update({ filePath: null}, null))
    }

    private deletePostData(post: Post) {
        return this.deletePostFileData(post)
        .then(() => post.destroy())
    }

    deleteOldData(option, callback: ExternalCallback) {
        let isBusy: boolean;
        this.Post.findAll({
            where: {
                $or: [
                    { 
                        isRead: true,
                        updatedAt: { $lt: new Date(Date.now() - READ_POST_LIFETIME) }
                    },
                    {
                        filePath: { $ne: null },
                        createdAt: { $lt: new Date(Date.now() - UNREAD_POST_LIFETIME) }
                    }
                ]
            },
            limit: DELETING_LIMIT
        })
        .then((posts: Post[]) => {
            isBusy = posts.length >= DELETING_LIMIT;
            return posts.reduce((prev, post) => {
                return prev.then(() => post.isRead ? this.deletePostData(post) : this.deletePostFileData(post));
            }, Promise.resolve());
        })
        .then(() => process.nextTick(callback, null, { isBusy }))
        .catch(err => callback(err, null));
    }
}
