(function()
{
    "use strict";

    var ns = namespace( "pc.model" );

    ns.FacebookPlayer = Backbone.Model.extend( {

        STATUS_LOGGED_IN:  "connected",
        FB_SCOPE:          "email, user_groups, user_events, user_likes, user_photos, user_relationships, user_status, user_videos, read_friendlists, read_stream, friends_about_me",
        FB_ME_URL:         "/me?fields=id,name,gender,locale",
        FB_FRIENDS_URL:    "/me/friends?fields=id,name",
        FB_FRIENDLIST_URL: "/me/friendlists/?fields=members.fields(id),id,name",
        FB_PICTURES_URL:   "/me/albums?fields=id,name,photos.fields(id,name,source,height,width,from)",
        FB_FEED_URL:       "/me/feed",
        FB_GRAPH_BASE:     "https://graph.facebook.com/",
        FB_IMAGE_SUFFIX:   "/picture?type=square",
        DELAY_INIT_EVENT:  2500,

        loggedin:     undefined,
        _friends:     undefined,
        _friendlists: undefined,
        _pictures:    undefined,
        _posts:       undefined,

        defaults: {
            id:      undefined,
            name:    undefined,
            locale:  undefined,
            picture: undefined,
            gender:  undefined
        },

        initialize: function()
        {
            console.log( "[FacebookPlayer] New FacebookPlayer" );

            FB.Event.subscribe( 'auth.authResponseChange', _.bind( this._authResponseChangeCb, this ) );

            FB.init( {
                appId:  '508385819190108',
                status: true,
                cookie: true
            } );

            this._initEventFired = false;
            this.set( 'results', new pc.model.TestresultCollection() );

            setTimeout( _.bind( function()
            {
                if ( !this._initEventFired ) {
                    this.loggedin = false;
                    this.trigger( "login:change", [this.loggedin] );
                }
            }, this ), this.DELAY_INIT_EVENT );
        },

        login: function()
        {
            console.log( "[FacebookPlayer] Loggin player in" );

            this.trigger( "login:start" );

            FB.login( _.bind( function()
            {
                this._authResponseChangeCb();
                this.trigger( "login:done" );
            }, this ), {
                scope: this.FB_SCOPE
            } );
        },

        logout: function()
        {
            console.log( "[FacebookPlayer] Loggin player out" );

            this.trigger( "login:start" );

            FB.logout( _.bind( function()
            {
                this._authResponseChangeCb();
                this.trigger( "login:done" );
            }, this ) );
        },

        _authResponseChangeCb: function( resp )
        {
            var oldLoggedIn = this.loggedin;

            if ( resp === undefined || !resp.status ) {
                return;
            }

            this.loggedin = ( resp.status === this.STATUS_LOGGED_IN );

            console.log( "[FacebookPlayer] old: " + oldLoggedIn + " new: " + this.loggedin );

            // load the userprofile if user is loggedin
            if ( this.loggedin && this.get( "name" ) === undefined ) {
                this._loadProfile();
            }

            if ( (resp.status === this.STATUS_LOGGED_IN) !== oldLoggedIn ) {
                this.trigger( "login:change",
                    [this.loggedin] );
            }
            this._initEventFired = true;
        },

        _loadProfile: function()
        {
            FB.api( this.FB_ME_URL, _.bind( function( response )
            {
                console.log( '[FacebookPlayer] ', response );

                this.set( "name", response.name );
                this.set( "id", response.id );
                this.set( "locale", response.locale );
                this.set( "gender", response.gender );
                this.set( "picture", this.FB_GRAPH_BASE + response.id + this.FB_IMAGE_SUFFIX );

                this.trigger( "profile:loaded" );
            }, this ) );
        },

        getFriends: function()
        {
            if ( this._friends === undefined ) {
                this._loadFriends();
                return undefined;
            }

            return this._friends;
        },

        _loadFriends: function()
        {
            this.trigger( "friends:start" );
            FB.api( this.FB_FRIENDS_URL, _.bind( function( response )
            {
                if ( !response.data ) {
                    this.trigger( "friends:error" );
                    console.error( "[FacebookPlayer] Error loading friends, response was: ", response );
                    return;
                }

                // parse all friends
                this._friends = new pc.model.FacebookUserCollection( _.map( response.data, function( friend )
                {
                    //console.debug("Parsing friend", friend);
                    try {
                        return new pc.model.FacebookUser( {name: friend.name, id: friend.id} );
                    }
                    catch ( e ) {
                        console.error( "[FacebookPlayer] Unable to parse friend: " + e.message );
                    }
                    return null;
                } ) );

                console.log( "[FacebookPlayer] Friends of " + this.get( "id" ) + ": ", this._friends );
                this.trigger( "friends:finished" );


            }, this ) );
        },

        getForeigners: function()
        {
            if ( this._foreigners === undefined ) {
                this._loadForeigners();
                return undefined;
            }

            return this._foreigners;
        },

        _loadForeigners: function()
        {
            var frc = pc.common.FacebookRandomCollector.getInstance();
            this.trigger( "random:start" );
            frc.on( 'frc:done', _.bind( function( users )
            {
                this._foreigners = users;
                console.log( "[FacebookPlayer] Foreigners of " + this.get( "id" ) + ": ", this._foreigners );
                this.trigger( "random:finished" );
            }, this ) );
            frc.collect();
        },

        getFriendLists: function()
        {
            if ( this._friendlists === undefined ) {
                this._loadFriendLists();
                return undefined;
            }

            return this._friendlists;
        },

        _loadFriendLists: function()
        {
            this.trigger( "friendlist:start" );
            if ( this.getFriends() === undefined ) {
                this.trigger( "friendlist:error" );
                console.log( "[FacebookPlayer] Error loading friendlist, friends not loaded" );
                return;
            }

            FB.api( this.FB_FRIENDLIST_URL, _.bind( function( response )
            {
                if ( !response.data ) {
                    this.trigger( "friendlist:error" );
                    console.error( "[FacebookPlayer] Error loading friendlist, response was: ", response );
                    return;
                }

                if ( response.data.length === 0 ) {
                    console.warn( "[FacebookPlayer] Users has no lists" );
                    this.trigger( "friendlist:finished" );
                }

                // parse all friends
                this._friendlists = new pc.model.FacebookListCollection( _.map( response.data, _.bind( function( list )
                {
                    var lid = list.id;
                    //console.debug("Parsing friendlist", lid, list);

                    var friendList = new pc.model.FacebookList( {
                        id:      list.id,
                        name:    list.name,
                        type:    list.list_type,
                        members: new pc.model.FacebookUserCollection()
                    } );

                    if ( list.members && list.members.data ) {
                        _.each( list.members.data, _.bind( function( member )
                        {
                            //console.debug("Adding " + this._friends.getByUid(member.id).get("name") + " to list " + list.name);
                            friendList.get( "members" ).add( this._friends.getByUid( member.id ) );
                        }, this ) );
                    }

                    return friendList;
                }, this ) ) );

                this.trigger( "friendlist:finished" );
                console.log( "[FacebookPlayer] Friendlists of " + this.get( "id" ) + ": ", this._friendlists );
            }, this ) );
        },

        getPictures: function()
        {
            if ( this._pictures === undefined ) {
                this._loadPictures();
                return undefined;
            }

            return this._pictures;
        },

        _loadPictures: function()
        {
            this.trigger( "pictures:start" );

            FB.api( this.FB_PICTURES_URL, _.bind( function( response )
            {
                if ( !response.data ) {
                    this.trigger( "pictures:error" );
                    console.error( "[FacebookPlayer] Error loading pictures, response was: ", response );
                    return;
                }

                if ( response.data.length === 0 ) {
                    console.warn( "[FacebookPlayer] Users has no albums" );
                    this.trigger( "pictures:finished" );
                }

                this._pictures = new pc.model.FacebookPictureCollection();

                var picturesNum = 0;
                _.each( response.data, _.bind( function( album )
                {

                    // skip some galleries like profile pictures
                    if ( _.contains( pc.model.FacebookPlayer.GALLERIES_TO_SKIP, album.name ) ) {
                        console.info( "[FacebookPlayer] Skipping current album, because it is ignored", album.name,
                            _.contains( pc.model.FacebookPlayer.GALLERIES_TO_SKIP, album.name ) );
                        return;
                    }

                    if ( album.photos ) {
                        picturesNum += album.photos.data.length;

                        _.each( album.photos.data, _.bind( function( photo )
                        {
                            try {
                                if ( photo.id === undefined ) {
                                    console.error( '[FacebookPlayer] Got invalid photo without id - skipping' );
                                    return;
                                }

                                var pic = new pc.model.FacebookPicture( {
                                    id:     photo.id,
                                    name:   photo.name,
                                    source: photo.source,
                                    width:  photo.width,
                                    height: photo.height
                                } );
                                var err = false;
                                pic.on( 'privacy', _.bind( function()
                                {
                                    if ( --picturesNum === 0 ) {
                                        console.log( "[FacebookPlayer] " + this._pictures.length + " Pictures of " + this.get( "id" ) + ": ",
                                            this._pictures );
                                        this.trigger( "pictures:finished" );
                                    }
                                    this._pictures.add( pic );
                                }, this ) );
                                pic.on( 'privacy-error', _.bind( function()
                                {
                                    if ( --picturesNum === 0 ) {
                                        console.log( "[FacebookPlayer] " + this._pictures.length + " Pictures of " + this.get( "id" ) + ": ",
                                            this._pictures );
                                        this.trigger( "pictures:finished" );
                                    }
                                    console.warn( "[FacebookPlayer] Error while getting privacy for picture, skipping" );
                                }, this ) );
                            }
                            catch ( e ) {
                                console.error( "[FacebookPlayer] Error creating FacebookPicture: ", e );
                            }
                        }, this ) );
                    }

                }, this ) );
            }, this ) );
        },

        getPosts: function()
        {
            if ( this._posts === undefined ) {
                this._loadPosts();
                return undefined;
            }

            return this._posts;
        },

        _loadPosts: function()
        {
            this.trigger( "posts:start" );
            if ( this.getFriends() === undefined ) {
                this.trigger( "posts:error" );
                console.log( "[FacebookPlayer] Error loading posts, friends not loaded" );
                return;
            }

            FB.api( this.FB_FEED_URL, _.bind( function( response )
            {
                if ( !response.data ) {
                    this.trigger( "posts:error" );
                    console.error( "[FacebookPlayer] Error loading psots, response was: ", response );
                    return;
                }

                // parse all posts
                this._posts = new pc.model.FacebookPostCollection( _.filter( response.data, _.bind( function( post )
                {
                    //console.debug("Parsing post", post);

                    // only own posts and post where privacy is set
                    if ( post.from.id === this.id && post.privacy !== undefined ) {
                        //console.log("Found post from player", post);
                        return new pc.model.FacebookPost( {message: post.message, id: post.id, privacy: post.privacy} );
                    }
                }, this ) ) );

                console.log( "[FacebookPlayer] Posts of " + this.get( "id" ) + ": ", this._posts );
                this.trigger( "posts:finished" );

            }, this ) );

        }

    }, {

        GALLERIES_TO_SKIP: ['Profile Pictures', 'Cover Photos'],

        getInstance: function()
        {
            if ( this.__instance === undefined ) {
                this.__instance = new pc.model.FacebookPlayer();
            }
            return this.__instance;
        }
    } );

})();