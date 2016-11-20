export class ClientLink {
  constructor() {
    this.view = new ClientLink.View();
    this.proxy = new ClientLink.Proxy();

    this._attachEventListeners();
  }

  _attachEventListeners() {
    this.view.onClick(function(url, data) {
      this.proxy.link(url, data);
    }.bind(this));

    this.proxy.onLinkRequestSuccess(function(data) {
      console.log(data);
    });
  }

  static View = class {
    constructor() {
      this.$link = $('#Link');
      this.onClick = Event.create();
      this._attachEventListeners();
    }

    _attachEventListeners() {
      this.$link.on('click', function() {
        this.onClick();
      }.bind(this));
    }
  };

  static Proxy = class {
    constructor() {
      this.onLinkRequestSuccess = Event.create();
    }

    link(url, data) {
      $.post(url, data).then(function(data) {
        this.onLinkRequestSuccess(data);
      }.bind(this));
    }
  };
}