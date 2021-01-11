/*
 *  Digital Excellence Copyright (C) 2020 Brend Smits
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published
 *   by the Free Software Foundation version 3 of the License.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty
 *   of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *   See the GNU Lesser General Public License for more details.
 *
 *   You can find a copy of the GNU Lesser General Public License
 *   along with this program, in the LICENSE.md file in the root project directory.
 *   If not, see https://www.gnu.org/licenses/lgpl-3.0.txt
 */
import {Component, Input, OnInit, ViewChild} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import Stepper from 'bs-stepper';
import {Subscription} from 'rxjs';
import {finalize} from 'rxjs/operators';
// Import showdown for markdown to html conversion.
import * as showdown from 'showdown';
import {FileUploaderComponent} from 'src/app/components/file-uploader/file-uploader.component';
import {Project} from 'src/app/models/domain/project';
import {AlertConfig} from 'src/app/models/internal/alert-config';
import {AlertType} from 'src/app/models/internal/alert-type';
import {MappedProject} from 'src/app/models/internal/mapped-project';
import {CollaboratorAdd} from 'src/app/models/resources/collaborator-add';
import {ProjectAdd} from 'src/app/models/resources/project-add';
import {LinkComponent} from "src/app/modules/project/add/manual/wizardmodules/link/wizardlink.component";
import {AlertService} from 'src/app/services/alert.service';
import {ProjectService} from 'src/app/services/project.service';
import {SEOService} from 'src/app/services/seo.service';
import {WizardService} from 'src/app/services/wizard.service';
import {QuillUtils} from 'src/app/utils/quill.utils';
import {DataService} from '../data.service';

/**
 * Component for manually adding a project.
 */
@Component({
  selector: 'app-manual',
  templateUrl: './manual.component.html',
  styleUrls: ['./manual.component.scss']
})

export class ManualComponent implements OnInit
{
  @Input() pageRange: string[];
  component = 'link';
  projectMessage: Project;
  subscription: Subscription;

  /**
   * Formgroup for entering project details.
   */
  public newProjectForm: FormGroup;
  public newCollaboratorForm: FormGroup;

  /**
   * Project stepper.
   */
  private stepper: Stepper;

  /**
   * Project's collaborators.
   */
  public collaborators: CollaboratorAdd[] = [];

  /**
   * Boolean to enable and disable submit button
   */
  public submitEnabled = true;

  /**
   * Configuration of QuillToolbar
   */
  public modulesConfigration = QuillUtils.getDefaultModulesConfiguration();

  /**
   * Configuration for file-picker
   */
  public acceptedTypes = ['image/png', 'image/jpg', 'image/jpeg'];
  public acceptMultiple = false;
  @ViewChild(FileUploaderComponent) fileUploader: FileUploaderComponent;

  constructor(
    private dataService: DataService,
    private router: Router,
    private formBuilder: FormBuilder,
    private projectService: ProjectService,
    private wizardService: WizardService,
    private alertService: AlertService,
    private seoService: SEOService,)
  {
    this.newProjectForm = this.formBuilder.group({
      name: [null, Validators.required],
      uri: [null, Validators.required],
      shortDescription: [null, Validators.required],
      description: [null],
    });

    this.newCollaboratorForm = this.formBuilder.group({
      fullName: [null, Validators.required],
      role: [null, Validators.required],
    });
  }

  ngOnInit(): void
  {
    // Keep updated with incoming messages;
    this.subscription = this.dataService.currentProject.subscribe((message: Project) =>
    {
      this.projectMessage = message;
    });

    this.wizardService.fetchedProject.subscribe(project =>
    {
      if (project == null)
      {
        return;
      }

      if (project.description != null && project.description.length > 0)
      {
        const converter = new showdown.Converter(
          {
            literalMidWordUnderscores: true
          }
        );
        project.description = converter.makeHtml(project.description);
      }
      this.fillFormWithProject(project);
    });

    // Updates meta and title tags
    this.seoService.updateTitle('Add new project');
    this.seoService.updateDescription('Create a new project in DeX');
  }


  ngOnDestroy() {
    this.subscription.unsubscribe();
  }


  /**
   * Method which triggers when the submit button is pressed.
   * Creates a new project.
   */
  public onClickSubmit(): void
  {
    if (!this.newProjectForm.valid)
    {
      this.newProjectForm.markAllAsTouched();
      const alertConfig: AlertConfig = {
        type: AlertType.danger,
        preMessage: 'The add project form is invalid',
        mainMessage: 'The project could not be saved, please fill all required fields',
        dismissible: true,
        timeout: this.alertService.defaultTimeout
      };
      this.alertService.pushAlert(alertConfig);
      return;
    }

    const newProject: ProjectAdd = this.newProjectForm.value;
    newProject.collaborators = this.collaborators;
    // Start uploading files
    this.fileUploader.uploadFiles()
      .subscribe(uploadedFiles =>
      {
        if (uploadedFiles)
        {
          if (uploadedFiles[0])
          {
            // Project icon was set and uploaded
            newProject.fileId = uploadedFiles[0].id;
            this.createProject(newProject);
          }
          // Project icon was set but not uploaded successfully, the component will show the error
        } else
        {
          // There was no project icon
          newProject.fileId = 0;
          this.createProject(newProject);
        }
      });
  }

  /**
   * Method which triggers when the add Collaborator button is pressed.
   * Adds submitted Collaborator to the collaborator array.
   */
  public onClickAddCollaborator(): void
  {
    if (!this.newCollaboratorForm.valid)
    {
      const alertConfig: AlertConfig = {
        type: AlertType.danger,
        preMessage: 'The add collaborator form is invalid',
        mainMessage: 'Collaborator could not be added',
        dismissible: true
      };
      this.alertService.pushAlert(alertConfig);
      return;
    }

    const newCollaborator: CollaboratorAdd = this.newCollaboratorForm.value;
    this.collaborators.push(newCollaborator);
    this.newCollaboratorForm.reset();
  }

  /**
   * Method which triggers when the delete Collaborator button is pressed.
   * Removes the collaborators from the collaborator array.
   */
  public onClickDeleteCollaborator(clickedCollaborator: CollaboratorAdd): void
  {
    const index = this.collaborators.findIndex((collaborator) => collaborator === clickedCollaborator);
    if (index < 0)
    {
      const alertConfig: AlertConfig = {
        type: AlertType.danger,
        mainMessage: 'Collaborator could not be removed',
        dismissible: true
      };
      this.alertService.pushAlert(alertConfig);
      return;
    }
    this.collaborators.splice(index, 1);
  }


  private createProject(newProject): void
  {
    this.projectService
      .post(newProject)
      .pipe(finalize(() => (this.submitEnabled = false)))
      .subscribe(() =>
      {
        const alertConfig: AlertConfig = {
          type: AlertType.success,
          mainMessage: 'Project was succesfully saved',
          dismissible: true
        };
        this.alertService.pushAlert(alertConfig);
        this.router.navigate([`/project/overview`]);
      });
  }

  /**
   * Method to fill a form with the values of a mapped project.
   */
  private fillFormWithProject(project: MappedProject): void
  {
    this.newProjectForm.get('name').setValue(project.name);
    this.newProjectForm.get('uri').setValue(project.uri);
    this.newProjectForm.get('shortDescription').setValue(project.shortDescription);
    this.newProjectForm.get('description').setValue(project.description);
    this.collaborators = project.collaborators;
  }

  next(page: string)
  {
    console.log('we arrived');
    // Component == page;
    this.stepper.next();
    this.component = 'final';
    console.log('component value is ' + this.component)
    // if (component === "final") this.dummyComponent = FinalComponent;
    // else if (component === "link") this.dummyComponent = LinkComponent;
    // else if (component === "colab") this.dummyComponent = ColabComponent;
    // else if (component === "description") this.dummyComponent = DescriptionComponent;
    // else if (component === "name") this.dummyComponent = ProjectNameComponent;
  }

  onSubmit()
  {
    return false;
  }

  dummyComponent = LinkComponent;
  // dummyComponent = ProjectNameComponent;
  // dummyComponent = DescriptionComponent;
  // dummyComponent = ColabComponent;
  // dummyComponent = FinalComponent;

  assignComponent(component)
  {
    // if (component === "final") this.dummyComponent = FinalComponent;
    if (component === "link") this.dummyComponent = LinkComponent;
    // else if (component === "colab") this.dummyComponent = ColabComponent;
    // else if (component === "description") this.dummyComponent = DescriptionComponent;
    // else if (component === "name") this.dummyComponent = ProjectNameComponent;
  }

  public onClickNextButton() {
    console.log('something cool!')
  }
}


