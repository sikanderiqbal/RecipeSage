import { Component } from "@angular/core";
import { ModalController } from "@ionic/angular";

import { Recipe } from "../../../services/recipe.service";
import { Label } from "../../../services/label.service";

@Component({
  selector: "page-add-profile-item-modal",
  templateUrl: "add-profile-item-modal.page.html",
  styleUrls: ["add-profile-item-modal.page.scss"],
})
export class AddProfileItemModalPage {
  itemType = null;

  itemVisibility = null;
  visibilityTypePrettyNameMap = {
    public: "public",
    "friends-only": "friends only",
  };

  itemTitle = "";

  selectedRecipe?: Recipe;
  selectedLabel?: Label;

  constructor(private modalCtrl: ModalController) {}

  onItemTypeChange(event: any) {
    this.itemType = event.detail.value;
  }

  onItemVisibilityChange(event: any) {
    this.itemVisibility = event.detail.value;
  }

  cancel() {
    this.modalCtrl.dismiss();
  }

  done() {
    const {
      itemType,
      itemVisibility,
      itemTitle,
      selectedRecipe,
      selectedLabel,
    } = this;

    this.modalCtrl.dismiss({
      item: {
        title: itemTitle,
        type: itemType,
        visibility: itemVisibility,
        label: selectedLabel || null,
        recipe: selectedRecipe || null,
      },
    });
  }

  isValid() {
    return this.itemTitle && this.itemVisibility && this.isItemSelected();
  }

  isItemSelected() {
    return (
      this.itemType &&
      (this.itemType === "all-recipes" ||
        this.selectedRecipe ||
        this.selectedLabel)
    );
  }
}
