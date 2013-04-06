(function()
{
    "use strict";

    var ns = namespace( "pc.model" );

    ns.FacebookPicture = Backbone.Model.extend( {

        defaults: {
            id:      undefined,
            name:    undefined,
            source:  undefined,
            height:  undefined,
            width:   undefined,
            privacy: undefined
        },

        /**
         * Create a new FacebookPicture
         *
         * @param picture {{id: Number, source: String}}
         * @constructor
         */
        initialize:      function( picture )
        {
            if ( !picture.id || !picture.source ) {
                console.error( "[FacebookPicture] Missing required data (id, source)", picture.id, picture.source );
                throw new pc.common.Exception( "[FacebookPicture] Missing required data: id or source" );
            }

            this.set( "id", picture.id );
            this.set( "name", picture.name );
            this.set( "source", picture.source );
            this._getPrivacy();
        },

        /**
         * Transform list ids to ids of all list's members
         *
         * @param friends pc.model.FacebookUserCollection
         * @param friendlists pc.model.FacebookListCollection
         */
        validatePrivacy: function( friends, friendlists )
        {
            this.get( 'privacy' ).flattenLists( friends, friendlists );
        },

        _getPrivacy: function()
        {
            var privacy = new pc.common.PrivacyDefinition( {id: this.id} );
            this.set( "privacy", privacy );

            privacy.on( 'data', _.bind( function()
                {
                    this.trigger( 'privacy-done' );
                }, this ) ).on( 'error', _.bind( function()
                {
                    this.trigger( 'privacy-error' );
                }, this ) );

            privacy.load();
        }

    } );

})();