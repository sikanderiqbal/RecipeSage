import { Component } from "@angular/core";
import { NavController, ToastController } from "@ionic/angular";
import { TranslateService } from "@ngx-translate/core";

import { LoadingService } from "~/services/loading.service";
import { RecipeService } from "~/services/recipe.service";
import { UtilService, RouteMap, AuthType } from "~/services/util.service";

@Component({
  selector: "page-import-paprika",
  templateUrl: "import-paprika.page.html",
  styleUrls: ["import-paprika.page.scss"],
})
export class ImportPaprikaPage {
  defaultBackHref: string = RouteMap.ImportPage.getPath();

  loading = null;
  imageFile = null;

  ignoreLargeFiles: boolean;

  constructor(
    public navCtrl: NavController,
    public translate: TranslateService,
    public loadingService: LoadingService,
    public toastCtrl: ToastController,
    public recipeService: RecipeService,
    public utilService: UtilService
  ) {
    this.ignoreLargeFiles = !!localStorage.getItem("largeFileOverride");
  }

  setFile(event) {
    const files = (event.srcElement || event.target).files;
    if (!files) {
      return;
    }

    this.imageFile = files[0];
  }

  filePicker() {
    document.getElementById("filePicker").click();
  }

  isFileTooLarge() {
    if (
      !this.ignoreLargeFiles &&
      this.imageFile &&
      this.imageFile.size / 1024 / 1024 > 550
    ) {
      // File is larger than 550MB
      return true;
    }
    return false;
  }

  showFileTypeWarning() {
    if (!this.imageFile || !this.imageFile.name) return false;
    return !this.imageFile.name.toLowerCase().endsWith(".paprikarecipes");
  }

  async presentToast(msg: string) {
    (
      await this.toastCtrl.create({
        message: msg,
        duration: 6000,
      })
    ).present();
  }

  async submit() {
    this.loading = this.loadingService.start();

    const response = await this.recipeService.importPaprika(this.imageFile, {
      406: async () => {
        const message = await this.translate
          .get("pages.importPaprika.error")
          .toPromise();
        const close = await this.translate.get("generic.close").toPromise();

        (
          await this.toastCtrl.create({
            message,
            buttons: [
              {
                text: close,
                role: "cancel",
              },
            ],
          })
        ).present();
      },
      504: async () => {
        setTimeout(async () => {
          const message = await this.translate
            .get("pages.importPaprika.timeout")
            .toPromise();
          const close = await this.translate.get("generic.close").toPromise();

          (
            await this.toastCtrl.create({
              message,
              buttons: [
                {
                  text: close,
                  role: "cancel",
                },
              ],
            })
          ).present();
          this.navCtrl.navigateRoot(RouteMap.HomePage.getPath("main"));
        }, 20000);
      },
    });
    this.loading.dismiss();
    this.loading = null;
    if (!response.success) return;

    const message = await this.translate
      .get("pages.importPaprika.success")
      .toPromise();

    this.presentToast(message);

    this.navCtrl.navigateRoot(RouteMap.HomePage.getPath("main"));
  }
}
