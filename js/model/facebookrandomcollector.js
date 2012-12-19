var FacebookRandomCollector = Backbone.Model.extend({

	collect: function(settings) {
		if (settings === undefined) settings = {};

		var min = settings.min !== undefined ? settings.min : FacebookRandomCollector.DEFAULT_MIN;
		var users = settings.users !== undefined ? settings.users : new FacebookUserCollection();

		console.warn("[FacebookRandomCollector] Starting to collect, taking groups");
		this._collectGroup({
			users: users,
			min: min,

			done: _.bind(function(users) {
				this.trigger('frc:done', users);
			}, this),

			more: _.bind(function(users) {

				console.warn("[FacebookRandomCollector] Need more users, taking events");
				this._collectEvents({
					users: users,
					min: min,

					done: _.bind(function(users) {
						this.trigger('frc:done', users);
					}, this),

					more: _.bind(function(users) {
						console.warn("[FacebookRandomCollector] Need more users, taking search");

						this._collectSearch({
							users: users,
							min: min,

							done: _.bind(function(users) {
								this.trigger('frc:done', users);
							}, this),

							more: _.bind(function(users) {
								console.error("[FacebookRandomCollector] Need more users, nothing to take");
								this.trigger('frc:less', users);
							}, this)
						});

					}, this)
				});

			}, this)
		});
	},

	_collectGroup: function(cb) {

		var player = FacebookPlayer.getInstance();

		FB.api(FacebookRandomCollector.FB_GROUP_URL, _.bind(function(response) {
			if (!response.data) {
				this.trigger("frc:error");
				console.error("[FacebookRandomCollector] Error loading groups, response was: ", response);
				throw new Error({message: "[FacebookRandomCollector] Error loading groups, response was: " + response});
			}

			_.each(response.data, function(group) {
				if (group.members.data && group.members.data.length > 0) {
					_.each(group.members.data, function(member) {
						if (player.id !== member.id && player.getFriends().get(member.id) === undefined) {
							cb.users.add({name: member.name, id: member.id, type: FacebookUser.Type.FOREIGNER});
						}
					});
				}
			});

			console.debug('[FacebookRandomCollector] Having now ' + cb.users.length + " users with groups: " , cb.users);

			if (cb.users.length < cb.min)
				cb.more(cb.users);
			else
				cb.done(cb.users);

		}, this));
	},

	_collectEvents: function(cb) {

		var player = FacebookPlayer.getInstance();

		FB.api(FacebookRandomCollector.FB_EVENT_URL, _.bind(function(response) {
			if (!response.data) {
				this.trigger("frc:error");
				console.error("[FacebookRandomCollector] Error loading groups, response was: ", response);
				throw new Error({message: "[FacebookRandomCollector] Error loading groups, response was: " + response});
			}

			_.each(response.data, function(event) {

				if (event.attending.data && event.attending.data.length > 0) {
					_.each(event.attending.data, function(attendee) {

						if (player.getFriends().get(attendee.id) === undefined)
							cb.users.add({name: attendee.name, id: attendee.id, type: FacebookUser.Type.FOREIGNER});
					});
				}

				if (cb.users.length < cb.min) {
					if (event.maybe.data && event.maybe.data.length > 0) {
						_.each(event.maybe.data, function(maybee) {

							if (player.getFriends().get(maybee.id) === undefined)
								cb.users.add({name: maybee.name, id: maybee.id, type: FacebookUser.Type.FOREIGNER});
						});
					}
				}

				if (cb.users.length < cb.min) {
					if (event.invited.data && event.invited.data.length > 0) {
						_.each(event.invited.data, function(invitee) {

							if (player.getFriends().get(invitee.id) === undefined)
								cb.users.add({name: invitee.name, id: invitee.id, type: FacebookUser.Type.FOREIGNER});
						});
					}
				}

				if (cb.users.length < cb.min) {
					if (event.declined.data && event.declined.data.length > 0) {
						_.each(event.declined.data, function(declinee) {

							if (player.getFriends().get(declinee.id) === undefined)
								cb.users.add({name: declinee.name, id: declinee.id, type: FacebookUser.Type.FOREIGNER});
						});
					}
				}
			});

			console.debug('[FacebookRandomCollector] Having now ' + cb.users.length + " users with events: " , cb.users);

			if (cb.users.length < cb.min)
				cb.more(cb.users);
			else
				cb.done(cb.users);

		}, this));
	},

	_collectSearch: function(cb) {

		var player = FacebookPlayer.getInstance();
		this.alreadySearched = this.alreadySearched === undefined ? [] : this.alreadySearched;

		var randomName = undefined;
		while (!randomName || _.contains(this.alreadySearched, randomName)) {
			randomName = FacebookRandomCollector.USER_TO_SEARCH[$.randomBetween(0,FacebookRandomCollector.USER_TO_SEARCH.length - 1)];
		}
		this.alreadySearched.push(randomName);

		var url = FacebookRandomCollector.FB_SEARCH_URL + randomName;

		FB.api(url, _.bind(function(response) {
			if (!response.data) {
				this.trigger("frc:error");
				console.error("[FacebookRandomCollector] Error loading search, response was: ", response);
				throw new Error({message: "[FacebookRandomCollector] Error loading search, response was: " + response});
			}

			_.each(response.data, function(hit) {
				if (player.id !== hit.id && player.getFriends().get(hit.id) === undefined) {
					cb.users.add({name: hit.name, id: hit.id, type: FacebookUser.Type.FOREIGNER});
				}
			});

			console.debug('[FacebookRandomCollector] Having now ' + cb.users.length + ' users with search for ' + randomName + ':' , cb.users);

			if (cb.users.length < cb.min)
				this._collectSearch(cb);
			else
				cb.done(cb.users);

		}, this));
	}

}, {

	FB_GROUP_URL: '/me/groups/?fields=members.limit(50).fields(id,name)&limit=3',
	FB_EVENT_URL: '/me/events?fields=attending.limit(10).fields(id,name),maybe.limit(10).fields(id,name),invited.limit(10).fields(id,name),declined.limit(10).fields(id,name)&limit=3',
	FB_FRIEND_FEED_URL: '/?fields=feed.limit(100).fields(likes.fields(id,name),comments.fields(from))', // ID as first
	FB_SEARCH_URL: '/search?type=user&limit=10&q=',

	USER_TO_SEARCH: ['hans', 'michael', 'christian', 'fritz', 'max', 'simon', 'paul', 'nina', 'anna', 'nicole', 'claudia', 'lisa'],

	DEFAULT_MIN: 200,

	getInstance: function() {
		if (this.__instance === undefined) {
			this.__instance = new this();
		}
		return this.__instance;
	}

});