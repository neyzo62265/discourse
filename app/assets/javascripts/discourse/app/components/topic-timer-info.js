import { cancel, later } from "@ember/runloop";
import Category from "discourse/models/category";
import Component from "@ember/component";
import { DELETE_REPLIES_TYPE } from "discourse/controllers/edit-topic-timer";
import I18n from "I18n";
import discourseComputed from "discourse-common/utils/decorators";
import { iconHTML } from "discourse-common/lib/icon-library";
import { isTesting } from "discourse-common/config/environment";

export default Component.extend({
  classNames: ["topic-status-info"],
  _delayedRerender: null,
  clockIcon: `${iconHTML("far-clock")}`.htmlSafe(),
  trashCanIcon: `${iconHTML("trash-alt")}`.htmlSafe(),
  trashCanTitle: I18n.t("post.controls.remove_timer"),
  title: null,
  notice: null,
  showTopicTimer: null,

  @discourseComputed
  canRemoveTimer() {
    return this.currentUser && this.currentUser.get("canManageTopic");
  },

  @discourseComputed("canRemoveTimer", "removeTopicTimer")
  showTrashCan(canRemoveTimer, removeTopicTimer) {
    return canRemoveTimer && removeTopicTimer;
  },

  renderTopicTimer() {
    const isDeleteRepliesType = this.statusType === DELETE_REPLIES_TYPE;

    if (
      !isDeleteRepliesType &&
      !this.basedOnLastPost &&
      (!this.executeAt || this.executeAt < moment())
    ) {
      this.set("showTopicTimer", null);
      return;
    }

    if (this.isDestroyed) {
      return;
    }

    const topicStatus = this.topicClosed ? "close" : "open";
    const topicStatusKnown = this.topicClosed !== undefined;
    if (topicStatusKnown && topicStatus === this.statusType) {
      return;
    }

    const statusUpdateAt = moment(this.executeAt);
    const duration = moment.duration(statusUpdateAt - moment());
    const minutesLeft = duration.asMinutes();
    if (minutesLeft > 0 || isDeleteRepliesType || this.basedOnLastPost) {
      let rerenderDelay = 1000;
      if (minutesLeft > 2160) {
        rerenderDelay = 12 * 60 * 60000;
      } else if (minutesLeft > 1410) {
        rerenderDelay = 60 * 60000;
      } else if (minutesLeft > 90) {
        rerenderDelay = 30 * 60000;
      } else if (minutesLeft > 2) {
        rerenderDelay = 60000;
      }
      let durationMinutes = parseInt(this.durationMinutes, 0) || 0;

      let options = {
        timeLeft: duration.humanize(true),
        duration: moment
          .duration(durationMinutes, "minutes")
          .humanize({ s: 60, m: 60, h: 24 }),
      };

      const categoryId = this.categoryId;
      if (categoryId) {
        const category = Category.findById(categoryId);

        options = Object.assign(
          {
            categoryName: category.get("slug"),
            categoryUrl: category.get("url"),
          },
          options
        );
      }

      this.setProperties({
        title: `${moment(this.executeAt).format("LLLL")}`.htmlSafe(),
        notice: `${I18n.t(this._noticeKey(), options)}`.htmlSafe(),
        showTopicTimer: true,
      });

      // TODO Sam: concerned this can cause a heavy rerender loop
      if (!isTesting()) {
        this._delayedRerender = later(() => {
          this.renderTopicTimer();
        }, rerenderDelay);
      }
    } else {
      this.set("showTopicTimer", null);
    }
  },

  didReceiveAttrs() {
    this._super(...arguments);
    this.renderTopicTimer();
  },

  didInsertElement() {
    this._super(...arguments);

    if (this.removeTopicTimer) {
      $(this.element).on(
        "click.topic-timer-remove",
        "button",
        this.removeTopicTimer
      );
    }
  },

  willDestroyElement() {
    $(this.element).off("click.topic-timer-remove", this.removeTopicTimer);

    if (this._delayedRerender) {
      cancel(this._delayedRerender);
    }
  },

  _noticeKey() {
    let statusType = this.statusType;
    if (statusType === "silent_close") {
      statusType = "close";
    }
    if (this.basedOnLastPost && statusType === "close") {
      statusType = "close_after_last_post";
    }

    return `topic.status_update_notice.auto_${statusType}`;
  },
});
