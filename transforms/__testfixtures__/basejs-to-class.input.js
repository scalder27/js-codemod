var ClientLink = Base.extend({
  constructor: function() {
    this.view = new ClientLink.View();
    this.proxy = new ClientLink.Proxy();

    this._attachEventListeners();
  },
  _attachEventListeners: function() {
    this.view.onClick(function(url, data) {
      this.proxy.link(url, data);
    }.bind(this));

    this.proxy.onLinkRequestSuccess(function(data) {
      console.log(data);
    });
  },
}, {
  View: Base.extend({
    constructor: function() {
      this.$link = $('#Link');
      this.onClick = Event.create();
      this._attachEventListeners();
    },
    _attachEventListeners: function() {
      this.$link.on('click', function() {
        this.onClick();
      }.bind(this));
    },
  }),
  Proxy: Base.extend({
    constructor: function() {
      this.onLinkRequestSuccess = Event.create();
    },
    link: function(url, data) {
      $.post(url, data).then(function(data) {
        this.onLinkRequestSuccess(data);
      }.bind(this));
    },
  }),
});